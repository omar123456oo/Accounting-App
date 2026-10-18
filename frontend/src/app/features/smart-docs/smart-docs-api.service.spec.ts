import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SmartDocsApi } from './smart-docs-api.service';
import { UploadDone, UploadProgress } from './smart-docs.models';
import { checkPdf, isBusy } from './smart-docs-ui';

const B = '/api/v1/staff/docs';

describe('SmartDocsApi', () => {
  let api: SmartDocsApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(SmartDocsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('passes only the filters that are set, and unwraps the page', () => {
    let total = 0;
    api.list({ q: 'nile', status: 'active', page: 2, expiryFrom: '', typeKey: undefined }).subscribe((p) => (total = p.meta.total));
    const req = http.expectOne((r) => r.url === `${B}/documents`);
    expect(req.request.params.keys().sort()).toEqual(['page', 'q', 'status']);
    req.flush({ data: [], meta: { page: 2, pageSize: 20, total: 41 } });
    expect(total).toBe(41);
  });

  it('uploads multipart with the file and metadata, reporting progress then the stored document', () => {
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'c.pdf', { type: 'application/pdf' });
    const events: Array<UploadProgress | UploadDone> = [];
    api.upload({ file, title: 'Contract', typeKey: 'contract', visibility: 'restricted', allowDuplicate: true }).subscribe((e) => events.push(e));
    const req = http.expectOne(`${B}/documents`);
    expect(req.request.method).toBe('POST');
    const form = req.request.body as FormData;
    expect((form.get('file') as File).name).toBe('c.pdf');
    expect(form.get('title')).toBe('Contract'); expect(form.get('typeKey')).toBe('contract'); expect(form.get('visibility')).toBe('restricted'); expect(form.get('allowDuplicate')).toBe('true');
    expect(form.has('ownerId')).toBe(false);
    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    req.flush({ data: { id: 'd1', title: 'Contract' } });
    expect(events[0]).toEqual({ kind: 'progress', percent: 50 });
    expect(events[events.length - 1]).toMatchObject({ kind: 'done', doc: { id: 'd1' } });
  });

  it('asks for the preview with inline=1 and reads bytes as a Blob', () => {
    api.file('d1', { inline: true, version: 2 }).subscribe();
    const req = http.expectOne((r) => r.url === `${B}/documents/d1/file`);
    expect(req.request.params.get('inline')).toBe('1'); expect(req.request.params.get('version')).toBe('2'); expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x']));
  });

  it('encodes ids so a crafted value cannot change the path', () => {
    api.get('a/../b?x').subscribe();
    http.expectOne(`${B}/documents/a%2F..%2Fb%3Fx`).flush({ data: {} });
  });

  it('sends the approved values, never the proposals, on approval, and the draft on save', () => {
    api.approve('d1', { title: 'T', amount: { amount: 5, currency: 'EGP' } }).subscribe();
    const a = http.expectOne(`${B}/documents/d1/approve`);
    expect(a.request.body).toEqual({ values: { title: 'T', amount: { amount: 5, currency: 'EGP' } } });
    a.flush({ data: {} });
    api.saveDraft('d1', { title: { decision: 'accepted', value: 'T' } }).subscribe();
    const d = http.expectOne(`${B}/documents/d1/review`);
    expect(d.request.method).toBe('PUT'); expect(d.request.body).toEqual({ draft: { title: { decision: 'accepted', value: 'T' } } });
    d.flush({ data: { savedAt: 'now' } });
  });

  it('archives and starts a manual entry through the transition route', () => {
    api.archive('d1', 'old').subscribe(); const a = http.expectOne(`${B}/documents/d1/transition`); expect(a.request.body).toEqual({ to: 'archived', reason: 'old' }); a.flush({ data: {} });
    api.manualEntry('d1').subscribe(); const m = http.expectOne(`${B}/documents/d1/transition`); expect(m.request.body).toEqual({ to: 'pending_review' }); m.flush({ data: {} });
  });

  it('maps reminder rule calls', () => {
    api.rules({ scope: 'type' }).subscribe(); http.expectOne((r) => r.url === `${B}/reminder-rules` && r.params.get('scope') === 'type').flush({ data: [] });
    api.deleteRule('r1').subscribe(); expect(http.expectOne(`${B}/reminder-rules/r1`).request.method).toBe('DELETE');
    api.retry('j1').subscribe(); http.expectOne(`${B}/reminders/j1/retry`).flush({ data: {} });
  });
});

describe('PDF checks and busy states', () => {
  const pdf = (bytes: number[], name = 'a.pdf', size?: number) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }) as File & { size: number } && Object.defineProperty(new File([new Uint8Array(bytes)], name), 'size', { value: size ?? bytes.length }) as File;
  const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31];

  it('accepts a real PDF and refuses empty, oversize, wrong-extension and fake files', async () => {
    expect(await checkPdf(new File([new Uint8Array(MAGIC)], 'a.pdf'), 1000)).toBeNull();
    expect(await checkPdf(new File([], 'a.pdf'), 1000)).toBe('empty');
    expect(await checkPdf(pdf(MAGIC, 'a.pdf', 5000), 1000)).toBe('tooLarge');
    expect(await checkPdf(new File([new Uint8Array(MAGIC)], 'a.exe'), 1000)).toBe('extension');
    expect(await checkPdf(new File([new TextEncoder().encode('hello world')], 'a.pdf'), 1000)).toBe('signature');
  });

  it('keeps asking while the server is still reading', () => {
    expect(isBusy('uploaded', 'queued')).toBe(true);
    expect(isBusy('processing', 'running')).toBe(true);
    expect(isBusy('active', 'queued')).toBe(true);
    expect(isBusy('pending_review', 'succeeded')).toBe(false);
    expect(isBusy('extraction_failed', 'failed')).toBe(false);
  });
});
