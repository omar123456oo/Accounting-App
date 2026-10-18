import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ReminderRuleEditor } from './reminder-rule-editor';
import { SmartDocDetail } from './smart-doc-detail';
import { SmartDocTypes } from './smart-doc-types';
import { DocTypeDef, ReminderRule, SmartDoc } from './smart-docs.models';

const B = '/api/v1/staff/docs';
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const f = (key: string, type: DocTypeDef['fields'][number]['type'], order: number, extra: Partial<DocTypeDef['fields'][number]> = {}) => ({ key, label: key, labelAr: null, type, required: false, active: true, order, options: [], sensitive: false, role: null, referenceKind: null, aiHint: null, format: null, ...extra });
const TYPE: DocTypeDef = { key: 'contract', label: 'Contract', labelAr: null, category: 'legal', keywords: ['contract'], expiringSoonDays: 60, active: true, builtin: true, fields: [f('title', 'text', 0, { required: true }), f('end_date', 'date', 1, { role: 'expiry_date' })] };
const doc = (over: Partial<SmartDoc> = {}): SmartDoc => ({ id: 'd1', title: 'Nile contract', number: null, typeKey: 'contract', typeChosen: true, status: 'active', extractionStatus: 'succeeded', reminderStatus: 'scheduled', visibility: 'office', ownerId: null, ownerName: 'Karim', employeeId: null, departmentId: null, reviewerId: null, related: null, values: { title: 'Nile', end_date: '2027-03-01' }, expiryDate: '2027-03-01', startDate: null, endDate: null, renewalDate: null, currentVersion: 2, approvedAt: '2026-10-01T00:00:00Z', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...over });

async function open<T>(component: new () => T, route: string, url: string, can: (p: string) => boolean) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter([{ path: route, component }]), { provide: AuthService, useValue: { can } }] });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const nav = harness.navigateByUrl(url, component);
  await tick();
  return { http, harness, nav, el: () => harness.routeNativeElement as HTMLElement };
}
const labels = (el: HTMLElement) => [...el.querySelectorAll('button, a.btn')].map((b) => b.textContent!.trim());

describe('Smart document detail', () => {
  async function render(d: SmartDoc, can: (p: string) => boolean) {
    const s = await open(SmartDocDetail, 'smart-documents/:id', 'smart-documents/d1', can);
    s.http.expectOne(`${B}/lookups`).flush({ data: { users: [], departments: [], employees: [], roles: [] } });
    s.http.expectOne(`${B}/config`).flush({ data: { limits: { maxUploadMb: 20, maxPages: 200 } } });
    s.http.expectOne(`${B}/documents/d1`).flush({ data: d });
    await tick();
    s.http.expectOne(`${B}/types/contract`).flush({ data: TYPE });
    await tick(); await s.nav; s.harness.detectChanges();
    return s;
  }

  it('shows status, approved values and only the actions the person may take', async () => {
    const s = await render(doc(), (p) => ['documents.view', 'documents.download'].includes(p));
    expect(s.el().textContent).toContain('smartDocs.status.active');
    expect(s.el().textContent).toContain('2027-03-01');
    const b = labels(s.el()).join('|');
    expect(b).toContain('smartDocs.actions.download');
    for (const hidden of ['common.edit', 'common.delete', 'smartDocs.actions.archive', 'smartDocs.actions.startRenewal', 'smartDocs.actions.replace']) expect(b).not.toContain(hidden);
  });

  it('offers review only for a document waiting for review, and renewal completion only during renewal', async () => {
    const all = () => true;
    let s = await render(doc({ status: 'pending_review', values: {} }), all);
    expect(labels(s.el())).toContain('smartDocs.actions.review');
    expect(labels(s.el())).not.toContain('smartDocs.actions.completeRenewal');
    expect(s.el().textContent).toContain('smartDocs.overview.notApproved');
    TestBed.resetTestingModule();
    s = await render(doc({ status: 'renewal_in_progress' }), all);
    expect(labels(s.el())).toContain('smartDocs.actions.completeRenewal');
    expect(labels(s.el())).not.toContain('smartDocs.actions.review');
    expect(labels(s.el())).not.toContain('smartDocs.actions.startRenewal');
  });

  it('an archived document cannot be edited, replaced or archived again', async () => {
    const s = await render(doc({ status: 'archived' }), () => true);
    const b = labels(s.el()).join('|');
    for (const hidden of ['common.edit', 'smartDocs.actions.replace', 'smartDocs.actions.archive']) expect(b).not.toContain(hidden);
  });

  it('loads versions when the tab is opened', async () => {
    const s = await render(doc(), () => true);
    [...s.el().querySelectorAll<HTMLButtonElement>('[role=tab]')].find((t) => t.textContent!.includes('versions'))!.click();
    s.http.expectOne(`${B}/documents/d1/versions`).flush({ data: [{ version: 2, fileName: 'c.pdf', sizeBytes: 2048, sha256: 'abc', pageCount: 1, uploadedBy: { id: 'u', name: 'Karim' }, uploadedAt: '2026-10-01T00:00:00Z', reason: null, current: true }] });
    await tick(); s.harness.detectChanges();
    expect(s.el().textContent).toContain('c.pdf'); expect(s.el().textContent).toContain('abc'); expect(s.el().textContent).toContain('2.0 KB');
  });
});

@Component({ selector: 'app-host', imports: [ReminderRuleEditor], template: `<app-reminder-rule-editor [types]="types" [lookups]="lookups" (saved)="saved = $event" (closed)="closed = true" />` })
class Host { types = [TYPE]; lookups = { users: [{ id: 'u1', name: 'Karim' }], departments: [], employees: [], roles: ['owner'] }; saved: ReminderRule | null = null; closed = false; }

describe('Reminder rule editor', () => {
  let fixture: ComponentFixture<Host>; let http: HttpTestingController;
  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  });
  const el = () => fixture.nativeElement as HTMLElement;
  const type = (id: string, v: string) => { const i = el().querySelector<HTMLInputElement>(id)!; i.value = v; i.dispatchEvent(new Event('input')); };
  const submit = async () => { el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit')); await fixture.whenStable(); };

  it('sends the timing, recipients and channels as entered, with no escalation unless it is switched on', async () => {
    type('#ru-name', 'Contract ending'); fixture.detectChanges(); await fixture.whenStable();
    await submit();
    const req = http.expectOne(`${B}/reminder-rules`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ scope: 'global', name: 'Contract ending', dateField: 'expiry_date', offsets: [{ amount: 30, unit: 'days', direction: 'before' }], recurring: null, time: '09:00', recipients: { owner: true, manager: false, users: [], roles: [] }, channels: { inApp: true, email: false }, escalation: null, active: true });
    req.flush({ data: { id: 'r1', name: 'Contract ending' } });
    expect((fixture.componentInstance.saved as ReminderRule).id).toBe('r1');
  });

  it('adds and removes timings, and shows the server message under the field it belongs to', async () => {
    type('#ru-name', 'R'); el().querySelector<HTMLButtonElement>('button.btn-outline-secondary.btn-sm')!.click(); fixture.detectChanges();
    expect(el().querySelectorAll('[id^="ru-amt-"]').length).toBe(2);
    await submit();
    const req = http.expectOne(`${B}/reminder-rules`);
    expect((req.request.body as { offsets: unknown[] }).offsets.length).toBe(2);
    req.flush({ message: 'The given data was invalid.', errors: { timezone: ['Unknown time zone.'] } }, { status: 422, statusText: 'Unprocessable' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(el().textContent).toContain('Unknown time zone.');
    expect(fixture.componentInstance.closed).toBe(false);
  });
});

describe('Document type administration', () => {
  async function render() {
    const s = await open(SmartDocTypes, 'smart-documents/types', 'smart-documents/types', () => true);
    s.http.expectOne((r) => r.url === `${B}/types`).flush({ data: [TYPE] });
    await s.nav; await tick(); s.harness.detectChanges();
    return s;
  }

  it('lists fields of the chosen type and saves them in the order shown, with changes', async () => {
    const s = await render();
    s.el().querySelector<HTMLButtonElement>('.list-group-item')!.click(); s.harness.detectChanges();
    expect(s.el().querySelectorAll('tbody tr code').length).toBe(2);
    s.el().querySelector<HTMLButtonElement>('button[aria-label^="smartDocs.types.down"]')!.click(); s.harness.detectChanges();
    const req = (() => { [...s.el().querySelectorAll<HTMLButtonElement>('button.btn-primary')].find((b) => b.textContent!.includes('smartDocs.types.saveFields'))!.click(); return s.http.expectOne(`${B}/types/contract/fields`); })();
    expect(req.request.method).toBe('PUT');
    expect((req.request.body.fields as Array<{ key: string; order: number }>).map((x) => [x.key, x.order])).toEqual([['end_date', 0], ['title', 1]]);
    req.flush({ data: TYPE });
    s.http.expectOne((r) => r.url === `${B}/types`).flush({ data: [TYPE] });
  });

  it('refuses a field key the server would refuse, without calling the server', async () => {
    const s = await render();
    s.el().querySelector<HTMLButtonElement>('.list-group-item')!.click(); s.harness.detectChanges();
    const key = s.el().querySelector<HTMLInputElement>('#nf-key')!; key.value = 'Bad Key'; key.dispatchEvent(new Event('input'));
    [...s.el().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('smartDocs.types.addField'))!.click(); s.harness.detectChanges();
    expect(s.el().textContent).toContain('smartDocs.types.keyHint');
    s.http.verify();
  });
});
