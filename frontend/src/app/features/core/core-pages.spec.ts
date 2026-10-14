import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CustomizeForm } from './customize-form';
import { DocTypeList } from './doctype-list';
import { RecordForm } from './record-form';
import { RecordList } from './record-list';
import { DocTypeMeta } from './core.models';

const META = (over: Partial<DocTypeMeta> = {}): DocTypeMeta => ({
  name: 'asset', label: 'Asset', module: 'ops', isCustom: true, titleField: 'tag', canManage: true,
  fields: [
    { fieldname: 'tag', label: 'Tag', fieldtype: 'text', required: true },
    { fieldname: 'price', label: 'Price', fieldtype: 'currency' },
    { fieldname: 'status', label: 'Status', fieldtype: 'select', options: ['new', 'used'] },
    { fieldname: 'notes', label: 'Notes', fieldtype: 'text' },
  ],
  ...over,
});

async function open<T>(url: string, component: new () => T, routes = ['records/:doctype', 'records/:doctype/:name', 'doctypes', 'doctypes/:name/customize']) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter(routes.map((path) => ({ path, component })))],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  return { http, harness, el: () => harness.routeNativeElement as HTMLElement, go: () => harness.navigateByUrl(url, component) };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Customize form', () => {
  it('shows built-in fields, edits custom ones and saves the whole list with their position', async () => {
    const { http, el, go, harness } = await open('doctypes/asset/customize', CustomizeForm);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush({ data: META() });
    http.expectOne('/api/v1/staff/core/customize/asset').flush({ data: { name: 'asset', fields: [{ fieldname: 'notes', label: 'Notes', fieldtype: 'text' }] } });
    await nav;
    harness.detectChanges();
    const text = el().textContent!;
    expect(text).toContain('Tag');
    expect(text).toContain('(tag)');
    expect(text).not.toContain('(notes)'); // the custom field is edited below, not listed as built-in
    expect((el().querySelectorAll('fieldset').length)).toBe(1);

    (el().querySelector('input[id$="-label-0"]') as HTMLInputElement).value = 'Remarks';
    (el().querySelector('input[id$="-label-0"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    harness.detectChanges();
    const save = [...el().querySelectorAll('button')].find((b) => b.textContent!.includes('common.save'))!;
    save.click();
    const put = http.expectOne('/api/v1/staff/core/customize/asset');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ fields: [{ fieldname: 'notes', label: 'Remarks', fieldtype: 'text' }] });
    put.flush({ data: { name: 'asset', fields: put.request.body.fields } });
    harness.detectChanges();
    expect(el().textContent).toContain('core.customize.saved');
  });

  it('shows the server message and keeps the rows when the save is rejected', async () => {
    const { http, el, go, harness } = await open('doctypes/asset/customize', CustomizeForm);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush({ data: META() });
    http.expectOne('/api/v1/staff/core/customize/asset').flush({ data: { name: 'asset', fields: [] } });
    await nav;
    harness.detectChanges();
    [...el().querySelectorAll('button')].find((b) => b.textContent!.includes('core.fields.add'))!.click();
    harness.detectChanges();
    [...el().querySelectorAll('button')].find((b) => b.textContent!.includes('common.save'))!.click();
    http.expectOne('/api/v1/staff/core/customize/asset').flush({ message: 'x', errors: { fields: ['Field 1: fieldname must be lowercase.'] } }, { status: 422, statusText: 'Unprocessable' });
    harness.detectChanges();
    expect(el().textContent).toContain('Field 1: fieldname must be lowercase.');
    expect(el().querySelectorAll('fieldset').length).toBe(1);
  });

  it('says so when the page cannot load', async () => {
    const { http, el, go, harness } = await open('doctypes/asset/customize', CustomizeForm);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush('no', { status: 404, statusText: 'Not found' });
    http.match('/api/v1/staff/core/customize/asset');
    await nav;
    harness.detectChanges();
    expect(el().textContent).toContain('core.loadFailed');
  });
});

describe('Document type list', () => {
  it('lists types, offers records and delete only for custom ones, and deletes after confirmation', async () => {
    const { http, el, go, harness } = await open('doctypes', DocTypeList);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/doctypes').flush({ data: [{ name: 'leave_request', label: 'Leave Request', module: 'hr', isCustom: false }, { name: 'asset', label: 'Asset', module: 'ops', isCustom: true }] });
    await nav;
    harness.detectChanges();
    const rows = [...el().querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).not.toContain('common.delete');
    expect(rows[0].textContent).not.toContain('core.docTypes.records');
    expect(rows[1].textContent).toContain('core.docTypes.records');
    ([...rows[1].querySelectorAll('button')].find((b) => b.textContent!.includes('common.delete')) as HTMLButtonElement).click();
    harness.detectChanges();
    http.expectNone('/api/v1/staff/core/doctypes/asset');
    ([...el().querySelectorAll('app-confirm-dialog button')].find((b) => b.classList.contains('btn-danger')) as HTMLButtonElement).click();
    const del = http.expectOne('/api/v1/staff/core/doctypes/asset');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/v1/staff/core/doctypes').flush({ data: [] });
  });

  it('creates a type from the form with the field rows and refreshes the list', async () => {
    const { http, el, go, harness } = await open('doctypes', DocTypeList);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/doctypes').flush({ data: [] });
    await nav;
    harness.detectChanges();
    [...el().querySelectorAll('button')].find((b) => b.textContent!.includes('core.docTypes.new'))!.click();
    harness.detectChanges();
    const set = (id: string, v: string) => { const i = document.getElementById(id) as HTMLInputElement; i.value = v; i.dispatchEvent(new Event('input')); };
    set('dt-name', 'vehicle'); set('dt-label', 'Vehicle'); set('dt-module', 'ops');
    harness.detectChanges();
    (document.querySelector('app-modal form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne('/api/v1/staff/core/doctypes');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toMatchObject({ name: 'vehicle', label: 'Vehicle', module: 'ops', titleField: 'title', fields: [{ fieldname: 'title', fieldtype: 'text', required: true }], viewPermission: 'clients.view', managePermission: 'admin.settings' });
    post.flush({ data: { name: 'vehicle', label: 'Vehicle', module: 'ops', isCustom: true } });
    http.expectOne('/api/v1/staff/core/doctypes').flush({ data: [] });
  });

  it('does not submit an invalid name', async () => {
    const { http, el, go, harness } = await open('doctypes', DocTypeList);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/doctypes').flush({ data: [] });
    await nav;
    [...el().querySelectorAll('button')].find((b) => b.textContent!.includes('core.docTypes.new'))!.click();
    harness.detectChanges();
    const i = document.getElementById('dt-name') as HTMLInputElement;
    i.value = 'Bad Name'; i.dispatchEvent(new Event('input'));
    (document.querySelector('app-modal form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectNone('/api/v1/staff/core/doctypes');
  });
});

describe('Record list', () => {
  const flushList = (http: HttpTestingController, canManage: boolean, rows: unknown[] = [{ name: 'ASSET-000001', title: 'A-1', data: { tag: 'A-1', price: 12.5 } }]) => {
    http.expectOne('/api/v1/staff/core/meta/asset').flush({ data: META({ canManage }) });
    http.expectOne((r) => r.url === '/api/v1/staff/core/records/asset').flush({ data: rows, meta: { page: 1, pageSize: 20, total: rows.length } });
  };

  it('shows columns from the field list and a New button only for people who can manage', async () => {
    const a = await open('records/asset', RecordList);
    const nav = a.go();
    await tick();
    flushList(a.http, true);
    await nav;
    a.harness.detectChanges();
    expect(a.el().textContent).toContain('A-1');
    expect(a.el().textContent).toContain('12.5');
    expect(a.el().textContent).toContain('core.records.new');
    expect(a.el().querySelector('a[href="/app/records/asset/ASSET-000001"]')).not.toBeNull();
  });

  it('hides New for a read-only viewer', async () => {
    const { http, el, go, harness } = await open('records/asset', RecordList);
    const nav = go();
    await tick();
    flushList(http, false);
    await nav;
    harness.detectChanges();
    expect(el().textContent).not.toContain('core.records.new');
  });

  it('searches after a pause and returns to page one', async () => {
    const { http, el, go, harness } = await open('records/asset', RecordList);
    const nav = go();
    await tick();
    flushList(http, true);
    await nav;
    harness.detectChanges();
    const q = el().querySelector('#rec-q') as HTMLInputElement;
    q.value = 'a-1';
    q.dispatchEvent(new Event('input'));
    await tick(400);
    const req = http.expectOne((r) => r.url === '/api/v1/staff/core/records/asset');
    expect(req.request.params.get('q')).toBe('a-1');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    harness.detectChanges();
    expect(el().textContent).toContain('core.records.empty');
  });

  it('shows a not-found message for an unknown type', async () => {
    const { http, el, go, harness } = await open('records/asset', RecordList);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush('no', { status: 404, statusText: 'Not found' });
    await nav;
    harness.detectChanges();
    expect(el().textContent).toContain('core.records.notFound');
  });
});

describe('Record form', () => {
  it('draws one input per visible field, blocks submit while a required field is empty, then posts the payload', async () => {
    const { http, el, go, harness } = await open('records/asset/new', RecordForm);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush({ data: META({ fields: [...META().fields, { fieldname: 'secret', label: 'Secret', fieldtype: 'text', hidden: true }] }) });
    await nav;
    harness.detectChanges();
    expect(el().querySelectorAll('input, select').length).toBe(4);
    expect(el().textContent).not.toContain('Secret');

    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    harness.detectChanges();
    http.expectNone('/api/v1/staff/core/records/asset');
    expect(el().textContent).toContain('validation.required');

    const set = (id: string, v: string) => { const i = el().querySelector(id) as HTMLInputElement; i.value = v; i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input')); };
    set('#f-tag', ' A-9 ');
    set('#f-price', '4.5');
    set('#f-status', 'used');
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne('/api/v1/staff/core/records/asset');
    expect(post.request.body).toEqual({ data: { tag: 'A-9', price: 4.5, status: 'used', notes: null } });
    post.flush({ data: { name: 'ASSET-000009', title: 'A-9', data: { tag: 'A-9' } } });
  });

  it('puts server field errors under the right field and keeps what was typed', async () => {
    const { http, el, go, harness } = await open('records/asset/new', RecordForm);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush({ data: META() });
    await nav;
    harness.detectChanges();
    const tag = el().querySelector('#f-tag') as HTMLInputElement;
    tag.value = 'dup'; tag.dispatchEvent(new Event('input'));
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne('/api/v1/staff/core/records/asset').flush({ message: 'bad', errors: { 'data.price': ['At most two decimal places.'] } }, { status: 422, statusText: 'Unprocessable' });
    harness.detectChanges();
    expect(el().textContent).toContain('At most two decimal places.');
    expect((el().querySelector('#f-tag') as HTMLInputElement).value).toBe('dup');
  });

  it('opens an existing record filled in, and is read-only when the person cannot manage', async () => {
    const { http, el, go, harness } = await open('records/asset/ASSET-000001', RecordForm);
    const nav = go();
    await tick();
    http.expectOne('/api/v1/staff/core/meta/asset').flush({ data: META({ canManage: false }) });
    http.expectOne('/api/v1/staff/core/records/asset/ASSET-000001').flush({ data: { name: 'ASSET-000001', title: 'A-1', data: { tag: 'A-1', price: 12.5 } } });
    await nav;
    harness.detectChanges();
    const tag = el().querySelector('#f-tag') as HTMLInputElement;
    expect(tag.value).toBe('A-1');
    expect(tag.disabled).toBe(true);
    expect(el().textContent).toContain('core.record.readOnly');
    expect(el().textContent).not.toContain('common.delete');
    expect(el().querySelector('button[type="submit"]')).toBeNull();
  });
});
