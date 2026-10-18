import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { SmartDocReview } from './smart-doc-review';
import { SmartDocsUpload } from './smart-docs-upload';
import { DocTypeDef, Extraction, SmartDoc } from './smart-docs.models';

const B = '/api/v1/staff/docs';
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const f = (key: string, type: DocTypeDef['fields'][number]['type'], order: number, extra: Partial<DocTypeDef['fields'][number]> = {}) => ({ key, label: key, labelAr: null, type, required: false, active: true, order, options: [], sensitive: false, role: null, referenceKind: null, aiHint: null, format: null, ...extra });
const TYPE: DocTypeDef = { key: 'contract', label: 'Contract', labelAr: null, category: 'legal', keywords: [], expiringSoonDays: 60, active: true, builtin: true, fields: [f('title', 'text', 0, { required: true }), f('end_date', 'date', 1, { role: 'expiry_date' }), f('payment_terms', 'text', 2), f('national_id', 'text', 3, { sensitive: true })] };
const DOC: SmartDoc = { id: 'd1', title: 'Nile contract', number: null, typeKey: 'contract', typeChosen: true, status: 'pending_review', extractionStatus: 'succeeded', reminderStatus: 'none', visibility: 'office', ownerId: null, employeeId: null, departmentId: null, reviewerId: null, related: null, values: {}, expiryDate: null, startDate: null, endDate: null, renewalDate: null, currentVersion: 1, approvedAt: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
const EXTRACTION: Extraction = {
  id: 'x1', status: 'succeeded', versionNumber: 1, provider: { text: 'pdfjs', ocr: 'none', ai: 'anthropic', model: 'm' }, steps: [], notes: [], error: null, detectedType: { key: 'contract', confidence: 1, method: 'user' }, pages: [{ page: 1, method: 'embedded', chars: 100 }], createdAt: '2026-10-01T00:00:00Z',
  fields: [
    { key: 'title', state: 'extracted', normalizedValue: 'Service Contract', confidence: 0.95, page: 1, sourceText: 'Service Contract', issues: [] },
    { key: 'end_date', state: 'extracted', normalizedValue: '2027-03-04', confidence: 0.5, page: 1, sourceText: 'End 03/04/2027', issues: ['Day and month could be read either way. Check the date.'] },
    { key: 'payment_terms', state: 'not_found', issues: [] },
    { key: 'national_id', state: 'not_found', issues: [], masked: true },
  ],
  draft: {}, draftSavedAt: null, approvedAt: null,
};

async function setup<T>(component: new () => T, route: string, url: string, can: (p: string) => boolean = () => true) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter([{ path: route, component }]), { provide: AuthService, useValue: { can } }] });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const nav = harness.navigateByUrl(url, component);
  await tick();
  return { http, harness, nav, el: () => harness.routeNativeElement as HTMLElement };
}

describe('Smart document review screen', () => {
  async function render(ext: Extraction = EXTRACTION, doc: SmartDoc = DOC) {
    const s = await setup(SmartDocReview, 'smart-documents/:id/review', 'smart-documents/d1/review');
    s.http.expectOne(`${B}/config`).flush({ data: { ai: { provider: 'anthropic', model: 'm', configured: true }, ocr: { provider: 'none', configured: false }, mail: { configured: true, host: 'h' }, scheduler: { inProcess: true, tickSeconds: 30 }, storage: { kind: 'local' }, limits: { maxUploadMb: 20, maxPages: 200 }, timezone: 'Africa/Cairo', aiRedactsSensitive: false } });
    s.http.expectOne(`${B}/lookups`).flush({ data: { users: [], departments: [], employees: [], roles: [] } });
    await tick();
    s.http.expectOne(`${B}/documents/d1`).flush({ data: doc });
    s.http.expectOne(`${B}/documents/d1/extraction`).flush({ data: ext });
    await tick();
    s.http.expectOne((r) => r.url === `${B}/types`).flush({ data: [TYPE] });
    await tick(); await s.nav;
    s.harness.detectChanges();
    // the preview asks for the file
    s.http.match(`${B}/documents/d1/file?inline=1`).forEach((r) => r.flush(new Blob(['%PDF-'])));
    return s;
  }
  const input = (el: HTMLElement, key: string) => el.querySelector<HTMLInputElement>(`[data-field="${key}"] input, [data-field="${key}"] textarea`)!;

  it('pre-fills the form from the extraction but saves nothing by itself', async () => {
    const s = await render();
    expect(input(s.el(), 'title').value).toBe('Service Contract');
    expect(input(s.el(), 'end_date').value).toBe('2027-03-04');
    expect(input(s.el(), 'payment_terms').value).toBe('');
    s.http.verify(); // no approve or save request was made
  });

  it('highlights the field that needs checking and shows its warning, and leaves a sure one alone', async () => {
    const s = await render();
    expect(s.el().querySelector('[data-field="end_date"]')!.classList.contains('border-warning')).toBe(true);
    expect(s.el().querySelector('[data-field="end_date"]')!.textContent).toContain('Day and month could be read either way');
    expect(s.el().querySelector('[data-field="title"]')!.classList.contains('border-warning')).toBe(false);
  });

  it('says plainly when a field was not found or is hidden, instead of showing a value', async () => {
    const s = await render();
    expect(s.el().querySelector('[data-field="payment_terms"]')!.textContent).toContain('smartDocs.fields.notFound');
    expect(s.el().querySelector('[data-field="national_id"]')!.textContent).toContain('smartDocs.fields.masked');
  });

  it('approves exactly what is in the form, including a correction the reviewer made', async () => {
    const s = await render();
    const title = input(s.el(), 'title');
    title.value = 'Corrected title'; title.dispatchEvent(new Event('input'));
    s.harness.detectChanges();
    s.el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await tick();
    const req = s.http.expectOne(`${B}/documents/d1/approve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.values).toMatchObject({ title: 'Corrected title', end_date: '2027-03-04', payment_terms: null });
    req.flush({ data: { ...DOC, status: 'active' } });
  });

  it('refuses to approve while a required field is empty', async () => {
    const s = await render();
    const title = input(s.el(), 'title');
    title.value = ''; title.dispatchEvent(new Event('input'));
    s.el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await tick(); s.harness.detectChanges();
    s.http.expectNone(`${B}/documents/d1/approve`);
    expect(s.el().textContent).toContain('smartDocs.review.fixErrors');
  });

  it('rejecting a proposal empties the field, and saving the draft sends only what was acted on', async () => {
    const s = await render();
    const rejectBtn = [...s.el().querySelectorAll<HTMLButtonElement>('[data-field="end_date"] button')].find((b) => b.textContent!.includes('smartDocs.fields.reject'))!;
    rejectBtn.click(); s.harness.detectChanges();
    expect(input(s.el(), 'end_date').value).toBe('');
    const save = [...s.el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('smartDocs.review.saveDraft'))!;
    save.click(); await tick();
    const req = s.http.expectOne(`${B}/documents/d1/review`);
    expect(req.request.body).toEqual({ draft: { end_date: { decision: 'rejected' } } });
    req.flush({ data: { savedAt: '2026-10-16T10:00:00Z' } });
  });

  it('resumes a saved draft over the proposal', async () => {
    const s = await render({ ...EXTRACTION, draft: { title: { decision: 'edited', value: 'Draft title' } }, draftSavedAt: '2026-10-15T10:00:00Z' });
    expect(input(s.el(), 'title').value).toBe('Draft title');
  });

  it('tells the reviewer when AI is not configured', async () => {
    const s = await setup(SmartDocReview, 'smart-documents/:id/review', 'smart-documents/d1/review');
    s.http.expectOne(`${B}/config`).flush({ data: { ai: { provider: 'none', model: null, configured: false }, ocr: { provider: 'none', configured: false }, mail: { configured: false, host: null }, scheduler: { inProcess: true, tickSeconds: 30 }, storage: { kind: 'local' }, limits: { maxUploadMb: 20, maxPages: 200 }, timezone: 'Africa/Cairo', aiRedactsSensitive: false } });
    s.http.expectOne(`${B}/lookups`).flush({ data: { users: [], departments: [], employees: [], roles: [] } });
    await tick();
    s.http.expectOne(`${B}/documents/d1`).flush({ data: DOC });
    s.http.expectOne(`${B}/documents/d1/extraction`).flush({ data: { ...EXTRACTION, status: 'text_only', fields: EXTRACTION.fields.map((x) => ({ key: x.key, state: 'not_found', issues: [] })) } });
    await tick();
    s.http.expectOne((r) => r.url === `${B}/types`).flush({ data: [TYPE] });
    await tick(); await s.nav; s.harness.detectChanges();
    s.http.match(`${B}/documents/d1/file?inline=1`).forEach((r) => r.flush(new Blob(['%PDF-'])));
    expect(s.el().textContent).toContain('smartDocs.review.noAi');
    expect(input(s.el(), 'title').value).toBe('');
  });
});

describe('Smart document upload screen', () => {
  async function render() {
    const s = await setup(SmartDocsUpload, 'smart-documents/upload', 'smart-documents/upload');
    s.http.expectOne(`${B}/config`).flush({ data: { ai: { provider: 'anthropic', model: 'm', configured: true }, ocr: { provider: 'none', configured: false }, mail: { configured: true, host: 'h' }, scheduler: { inProcess: true, tickSeconds: 30 }, storage: { kind: 'local' }, limits: { maxUploadMb: 1, maxPages: 200 }, timezone: 'Africa/Cairo', aiRedactsSensitive: false } });
    s.http.expectOne((r) => r.url === `${B}/types`).flush({ data: [TYPE] });
    s.http.expectOne(`${B}/lookups`).flush({ data: { users: [], departments: [], employees: [], roles: [] } });
    await s.nav; s.harness.detectChanges();
    return s;
  }
  const choose = async (s: Awaited<ReturnType<typeof render>>, file: File) => {
    const input = s.el().querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await tick(20); s.harness.detectChanges();
  };

  it('refuses a file that is not a PDF before sending anything', async () => {
    const s = await render();
    await choose(s, new File([new TextEncoder().encode('hello')], 'x.pdf', { type: 'application/pdf' }));
    expect(s.el().textContent).toContain('smartDocs.upload.problem.signature');
    expect(s.el().querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    s.http.verify();
  });

  it('uploads a PDF, and offers "upload anyway" when the server says it is a duplicate', async () => {
    const s = await render();
    await choose(s, new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'c.pdf', { type: 'application/pdf' }));
    expect(s.el().querySelector<HTMLInputElement>('#up-title')!.value).toBe('c');
    s.el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await tick();
    const first = s.http.expectOne(`${B}/documents`);
    expect((first.request.body as FormData).get('allowDuplicate')).toBeNull();
    first.flush({ message: 'dup', errors: { file: ['This exact file is already stored.'] } }, { status: 409, statusText: 'Conflict' });
    await tick(); s.harness.detectChanges();
    expect(s.el().textContent).toContain('smartDocs.upload.duplicate');
    s.el().querySelector<HTMLInputElement>('#up-dup')!.click(); s.harness.detectChanges();
    s.el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await tick();
    expect((s.http.expectOne(`${B}/documents`).request.body as FormData).get('allowDuplicate')).toBe('true');
  });
});
