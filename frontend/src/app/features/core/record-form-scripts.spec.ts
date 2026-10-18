import { EnvironmentProviders, Provider } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { ClientScriptRuntime } from './client-script-runtime';
import { DocTypeMeta } from './core.models';
import { RecordForm } from './record-form';

const T = '/api/v1/staff/core';
const META: DocTypeMeta = {
  name: 'asset', label: 'Asset', module: 'ops', isCustom: true, titleField: 'title', canManage: true,
  fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'text', required: true }, { fieldname: 'amount', label: 'Amount', fieldtype: 'currency' }, { fieldname: 'notes', label: 'Notes', fieldtype: 'text' }],
};
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const developer = { user: () => ({ id: 'u1', name: 'Dev', permissions: ['developer.scripts'] }), can: (p: string) => p === 'developer.scripts' };

async function render(codes: string[], auth?: unknown) {
  const providers: Array<Provider | EnvironmentProviders> = [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter([{ path: 'app/records/:doctype/:name', component: RecordForm }]), ...(auth ? [{ provide: AuthService, useValue: auth }] : [])];
  TestBed.configureTestingModule({ providers });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const nav = harness.navigateByUrl('app/records/asset/new', RecordForm);
  await tick();
  http.expectOne(`${T}/meta/asset`).flush({ data: META });
  await nav;
  http.expectOne(`${T}/scripts/client/asset`).flush({ data: codes.map((code, i) => ({ name: `rule${i + 1}`, code, order: 100 })) });
  await tick(400); // the script engine loads on demand
  harness.detectChanges();
  const el = () => harness.routeNativeElement as HTMLElement;
  const type = (sel: string, v: string) => { const i = el().querySelector(sel) as HTMLInputElement; i.value = v; i.dispatchEvent(new Event('input')); harness.detectChanges(); };
  const submit = () => (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  return { http, harness, el, type, submit };
}

describe('Record form with client scripts', () => {
  // load the script engine once, so the cold start does not depend on how busy the machine is
  beforeAll(async () => { (await ClientScriptRuntime.create([])).dispose(); }, 60000);

  it('lets a script hide a field, mark another required and show a message', async () => {
    const { el } = await render(['frm.on("refresh", () => { frm.toggle("notes", false); frm.set_required("amount"); frm.msg("Remember the quote"); });']);
    expect(el().querySelector('#f-notes')).toBeNull();
    expect(el().querySelector('label[for="f-amount"]')!.textContent).toContain('*');
    expect(el().querySelector('#f-title')).not.toBeNull();
    expect(el().querySelector('.alert-info')!.textContent).toContain('Remember the quote');
  });

  it('runs a change handler when the person edits that field', async () => {
    const { el, type } = await render(['frm.on("change:amount", () => frm.set("notes", "amount is " + frm.get("amount")));']);
    type('#f-amount', '42');
    await tick(50);
    expect((el().querySelector('#f-notes') as HTMLInputElement).value).toBe('amount is 42');
  });

  it('blocks the save with the script\'s message until the data is acceptable, then sends it', async () => {
    const { http, harness, el, type, submit } = await render(['frm.on("validate", () => { if (frm.get("amount") > 100) frm.throw("Amounts above 100 need a manager"); });', 'frm.on("before_save", () => frm.set("title", frm.get("title").toUpperCase()));']);
    type('#f-title', 'chairs');
    type('#f-amount', '500');
    submit();
    harness.detectChanges();
    http.expectNone(`${T}/records/asset`);
    expect(el().querySelector('.alert-danger')!.textContent).toContain('Amounts above 100 need a manager');
    type('#f-amount', '50');
    submit();
    const post = http.expectOne(`${T}/records/asset`);
    expect(post.request.body).toEqual({ data: { title: 'CHAIRS', amount: 50, notes: null } });
    post.flush({ data: { name: 'ASSET-000001', title: 'CHAIRS', data: { title: 'CHAIRS' } }, messages: ['Saved by the server script'] });
    harness.detectChanges();
    expect(el().textContent).toContain('Saved by the server script');
  });

  it('keeps what the server\'s scripts said when the page reloads on the saved record', async () => {
    const { http, harness, el, type, submit } = await render([]);
    type('#f-title', 'abc');
    submit();
    http.expectOne(`${T}/records/asset`).flush({ data: { name: 'ASSET-000001', title: 'ABC', data: { title: 'ABC' } }, messages: ['checked by guard'] });
    await tick(20);
    // the router now loads the saved record: the form is rebuilt from it
    http.expectOne(`${T}/meta/asset`).flush({ data: META });
    http.expectOne(`${T}/records/asset/ASSET-000001`).flush({ data: { name: 'ASSET-000001', title: 'ABC', data: { title: 'ABC' } } });
    await tick(20);
    http.expectOne(`${T}/scripts/client/asset`).flush({ data: [] });
    harness.detectChanges();
    expect(el().textContent).toContain('checked by guard');
    expect((el().querySelector('#f-title') as HTMLInputElement).value).toBe('ABC');
  });

  it('shows a button a script adds and runs it', async () => {
    const { harness, el, type } = await render(['frm.add_button("Fill notes", () => frm.set("notes", "filled for " + frm.get("title")));']);
    type('#f-title', 'abc');
    const button = [...el().querySelectorAll('app-page-header button')].find((b) => b.textContent!.includes('Fill notes')) as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    harness.detectChanges();
    expect((el().querySelector('#f-notes') as HTMLInputElement).value).toBe('filled for abc');
  });

  it('shows what a server script said when it refuses the save', async () => {
    const { http, harness, el, type, submit } = await render([]);
    type('#f-title', 'x');
    submit();
    http.expectOne(`${T}/records/asset`).flush({ message: 'A script stopped this.', errors: { script: ['no_negative: Amount cannot be negative'] } }, { status: 422, statusText: 'Unprocessable' });
    harness.detectChanges();
    expect(el().querySelector('.alert-danger')!.textContent).toContain('no_negative: Amount cannot be negative');
  });

  it('tells developers when a script does not load, and tells nobody else', async () => {
    const asDev = await render(['frm.on("refresh", () => {'], developer);
    expect(asDev.el().querySelector('.alert-warning')!.textContent).toContain('rule1');
    TestBed.resetTestingModule();
    const asUser = await render(['frm.on("refresh", () => {']);
    expect(asUser.el().querySelector('.alert-warning')).toBeNull();
    expect(asUser.el().querySelector('#f-title')).not.toBeNull(); // the form still works
  });

  it('keeps the form usable when a script runs away', async () => {
    const { http, harness, el, type, submit } = await render(['frm.on("refresh", () => { while (true) {} });']);
    expect(el().querySelector('#f-title')).not.toBeNull();
    expect(el().querySelector('.alert-info')!.textContent).toMatch(/stopped/i);
    type('#f-title', 'still saves');
    submit();
    expect(http.expectOne(`${T}/records/asset`).request.body.data.title).toBe('still saves');
    void harness;
  });

  it('opens normally when the type has no scripts', async () => {
    const { el } = await render([]);
    expect(el().querySelector('.alert-info')).toBeNull();
    expect(el().querySelectorAll('input').length).toBe(3);
  });
});
