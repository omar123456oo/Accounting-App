import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { addDays, setMockToday } from '../../core/mock-api/mock-clock';
import { failure, mockHttpProviders, signInDemo } from '../../testing/test-utils';
import { DocumentsApiService } from './documents-api.service';
import { DocumentUploadInput } from './documents.models';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x44, 0x45, 0x4d, 0x4f];
const EXE = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
const file = (name: string, type: string, bytes: number[]) => new File([new Uint8Array(bytes)], name, { type });

const input = (overrides: Partial<DocumentUploadInput> = {}): DocumentUploadInput => ({
  file: file('statement.pdf', 'application/pdf', PDF),
  name: 'DEMO Statement',
  category: 'bookkeeping',
  year: 2026,
  ...overrides,
});

describe('DocumentsApiService on the mock API', () => {
  let api: DocumentsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    api = TestBed.inject(DocumentsApiService);
  });
  afterEach(() => setMockToday(null));

  const all = async () => (await firstValueFrom(api.list({ pageSize: 100 }))).data;

  it('needs documents.view (403) for every read', async () => {
    await signInDemo('client@demo.test');
    expect((await failure(firstValueFrom(api.list()))).status).toBe(403);
    expect((await failure(firstValueFrom(api.download('d-003')))).status).toBe(403);
  });

  it('scopes staff without an office-wide role to their assigned clients, with 404 elsewhere', async () => {
    await signInDemo('accountant@demo.test');
    const docs = await all();
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((d) => ['c-001', 'c-002', 'c-003', 'c-006'].includes(d.clientId))).toBe(true);
    expect(docs.map((d) => d.id)).not.toContain('d-009');
    expect((await failure(firstValueFrom(api.get('d-009')))).status).toBe(404);
    expect((await failure(firstValueFrom(api.download('d-009')))).status).toBe(404);
    expect((await failure(firstValueFrom(api.listForClient('c-009')))).status).toBe(404);
    expect((await failure(firstValueFrom(api.upload('c-009', input())))).status).toBe(404);
    expect((await failure(firstValueFrom(api.uploadVersion('d-009', input().file)))).status).toBe(404);
    await signInDemo('owner@demo.test');
    expect((await all()).map((d) => d.id)).toContain('d-009');
  });

  it('downloads through an authenticated call that returns the bytes as a Blob', async () => {
    await signInDemo('owner@demo.test');
    const blob = await firstValueFrom(api.download('d-004'));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect((await failure(firstValueFrom(api.download('d-004', 9)))).status).toBe(404);
  });

  it('uploads a valid file as version 1, pending review, with a hash and the metadata', async () => {
    await signInDemo('accountant@demo.test');
    const doc = await firstValueFrom(api.upload('c-001', input({ tags: ['bank', 'q3'], periodLabel: '2026-09', description: 'DEMO note', expiryDate: '2027-01-31' })));
    expect(doc).toMatchObject({ clientId: 'c-001', name: 'DEMO Statement', category: 'bookkeeping', year: 2026, currentVersion: 1, reviewStatus: 'pending', tags: ['bank', 'q3'], periodLabel: '2026-09' });
    expect(doc.versions[0]).toMatchObject({ version: 1, fileName: 'statement.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length, uploadedBy: 'Demo Accountant' });
    expect(doc.versions[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    const back = await firstValueFrom(api.download(doc.id));
    expect(back.size).toBe(PDF.length);
  });

  it('needs documents.upload to upload', async () => {
    await signInDemo('client@demo.test');
    expect((await failure(firstValueFrom(api.upload('c-001', input())))).status).toBe(403);
  });

  it('re-checks the file on the server: disguised, mismatched, oversized and wrong-type files get 422', async () => {
    await signInDemo('owner@demo.test');
    const cases: Array<[File, string]> = [
      [file('invoice.pdf', 'application/pdf', EXE), 'signature'],
      [file('invoice.pdf', 'image/png', PDF), 'mime'],
      [file('setup.exe', 'application/octet-stream', EXE), 'extension'],
      [file('empty.pdf', 'application/pdf', []), 'empty'],
      [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.pdf', { type: 'application/pdf' }), 'tooLarge'],
    ];
    const before = (await all()).length;
    for (const [f] of cases) {
      const e = await failure(firstValueFrom(api.upload('c-001', input({ file: f }))));
      expect(e.status).toBe(422);
      expect(e.error.errors.file).toHaveLength(1);
    }
    expect((await all()).length).toBe(before);
  });

  it('validates the metadata', async () => {
    await signInDemo('owner@demo.test');
    const e = await failure(firstValueFrom(api.upload('c-001', input({ name: '', year: 1850, expiryDate: 'soon', category: 'x' as 'tax' }))));
    expect(e.status).toBe(422);
    expect(Object.keys(e.error.errors)).toEqual(expect.arrayContaining(['name', 'year', 'expiryDate', 'category']));
  });

  it('adds versions with incrementing numbers, keeps older bytes and sends the document back to review', async () => {
    await signInDemo('owner@demo.test');
    const first = await firstValueFrom(api.upload('c-001', input()));
    await firstValueFrom(api.review(first.id, 'approved'));
    const second = await firstValueFrom(api.uploadVersion(first.id, file('statement-v2.pdf', 'application/pdf', [...PDF, 0x32])));
    expect(second.currentVersion).toBe(2);
    expect(second.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(second.reviewStatus).toBe('pending');
    const third = await firstValueFrom(api.uploadVersion(first.id, file('statement-v3.pdf', 'application/pdf', [...PDF, 0x33, 0x33])));
    expect(third.currentVersion).toBe(3);
    expect((await firstValueFrom(api.download(first.id, 1))).size).toBe(PDF.length);
    expect((await firstValueFrom(api.download(first.id))).size).toBe(PDF.length + 2);
    const bad = await failure(firstValueFrom(api.uploadVersion(first.id, file('x.pdf', 'application/pdf', EXE))));
    expect(bad.status).toBe(422);
    expect((await firstValueFrom(api.get(first.id))).currentVersion).toBe(3);
  });

  it('reviews: needs documents.review, a comment to reject, and only decides pending documents once', async () => {
    await signInDemo('accountant@demo.test');
    expect((await failure(firstValueFrom(api.review('d-003', 'approved')))).status).toBe(403);
    await signInDemo('chief@demo.test');
    const noComment = await failure(firstValueFrom(api.review('d-003', 'rejected', '   ')));
    expect(noComment.status).toBe(422);
    expect(noComment.error.errors.comment).toBeTruthy();
    const rejected = await firstValueFrom(api.review('d-003', 'rejected', 'Page 2 is unreadable'));
    expect(rejected.reviewStatus).toBe('rejected');
    expect(rejected.reviewComments.at(-1)).toMatchObject({ decision: 'rejected', comment: 'Page 2 is unreadable', author: 'Demo Chief Accountant' });
    expect((await failure(firstValueFrom(api.review('d-003', 'approved')))).status).toBe(409);
    const approved = await firstValueFrom(api.review('d-008', 'approved'));
    expect(approved.reviewStatus).toBe('approved');
    expect((await failure(firstValueFrom(api.review('d-008', 'maybe' as 'approved')))).status).toBe(422);
  });

  it('filters, searches, sorts and paginates on the server', async () => {
    await signInDemo('owner@demo.test');
    const total = (await all()).length;
    const page = await firstValueFrom(api.list({ pageSize: 3, page: 2 }));
    expect(page.meta).toEqual({ page: 2, pageSize: 3, total });
    expect(page.data).toHaveLength(3);
    expect((await firstValueFrom(api.list({ category: 'tax', pageSize: 100 }))).data.every((d) => d.category === 'tax')).toBe(true);
    expect((await firstValueFrom(api.list({ year: 2025, pageSize: 100 }))).data.every((d) => d.year === 2025)).toBe(true);
    expect((await firstValueFrom(api.list({ reviewStatus: 'pending', pageSize: 100 }))).data.every((d) => d.reviewStatus === 'pending')).toBe(true);
    expect((await firstValueFrom(api.list({ clientId: 'c-003', pageSize: 100 }))).data.map((d) => d.id).sort()).toEqual(['d-001', 'd-002']);
    expect((await firstValueFrom(api.list({ q: 'lease', pageSize: 100 }))).data.map((d) => d.id)).toEqual(['d-005']);
    const desc = (await firstValueFrom(api.list({ sort: 'name', dir: 'desc', pageSize: 100 }))).data.map((d) => d.name);
    expect(desc).toEqual([...desc].sort((a, b) => b.localeCompare(a)));
  });

  it('computes the expiry state on the server from its business date, which tests can move', async () => {
    await signInDemo('owner@demo.test');
    const state = async () => (await firstValueFrom(api.get('d-005'))).expiryState;
    const expiry = (await firstValueFrom(api.get('d-005'))).expiryDate!;
    expect(await state()).toBe('expiring_soon');
    setMockToday(addDays(expiry, 1));
    expect(await state()).toBe('expired');
    setMockToday(addDays(expiry, -90));
    expect(await state()).toBe('valid');
    expect((await firstValueFrom(api.get('d-004'))).expiryState).toBe('none');
    setMockToday(null);
    const expiring = (await firstValueFrom(api.list({ expiring: true, pageSize: 100 }))).data.map((d) => d.id).sort();
    expect(expiring).toEqual(['d-005', 'd-007']);
  });

  it('tracks missing-document requests: create, overdue flag, cancel once, and fulfil by upload', async () => {
    await signInDemo('accountant@demo.test');
    const open = await firstValueFrom(api.listRequests('c-001'));
    expect(open.find((r) => r.id === 'r-2')?.overdue).toBe(true);
    const made = await firstValueFrom(api.createRequest('c-001', { label: 'DEMO Rent receipts', dueDate: '2026-11-30' }));
    expect(made).toMatchObject({ status: 'open', overdue: false, requestedBy: 'Demo Accountant' });
    expect((await failure(firstValueFrom(api.createRequest('c-001', { label: '', dueDate: '2026-11-30' })))).status).toBe(422);
    const doc = await firstValueFrom(api.upload('c-001', input({ requestId: made.id })));
    const after = (await firstValueFrom(api.listRequests('c-001'))).find((r) => r.id === made.id)!;
    expect(after).toMatchObject({ status: 'fulfilled', documentId: doc.id });
    expect((await firstValueFrom(api.updateRequest('r-1', 'cancelled'))).status).toBe('cancelled');
    expect((await failure(firstValueFrom(api.updateRequest('r-1', 'cancelled')))).status).toBe(409);
    expect((await failure(firstValueFrom(api.listRequests('c-009')))).status).toBe(404);
    await signInDemo('client@demo.test');
    expect((await failure(firstValueFrom(api.createRequest('c-001', { label: 'x', dueDate: '2026-11-30' })))).status).toBe(403);
  });
});
