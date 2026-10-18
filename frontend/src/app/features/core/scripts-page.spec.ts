import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ClientScriptRuntime } from './client-script-runtime';
import { DocTypeMeta } from './core.models';
import { ScriptDef } from './scripts-api.service';
import { ScriptsPage } from './scripts-page';

const T = '/api/v1/staff/core';
const META: DocTypeMeta = { name: 'asset', label: 'Asset', module: 'ops', isCustom: true, titleField: 'title', canManage: true, fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'text' }, { fieldname: 'amount', label: 'Amount', fieldtype: 'currency' }] };
const SCRIPT = (over: Partial<ScriptDef> = {}): ScriptDef => ({ id: 's1', doctype: 'asset', kind: 'server', name: 'no_negative', event: 'before_save', code: 'if (doc.data.amount < 0) throw_error("no");', enabled: true, order: 100, description: null, version: 1, ...over });
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function render(list: ScriptDef[]) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter([{ path: 'doctypes/:name/scripts', component: ScriptsPage }])] });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const nav = harness.navigateByUrl('doctypes/asset/scripts', ScriptsPage);
  await tick();
  http.expectOne(`${T}/meta/asset`).flush({ data: META });
  http.expectOne((r) => r.url === `${T}/scripts` && r.params.get('doctype') === 'asset').flush({ data: list });
  await nav;
  harness.detectChanges();
  const el = () => harness.routeNativeElement as HTMLElement;
  const doc = () => document.body;
  const click = (root: HTMLElement, text: string) => ([...root.querySelectorAll('button')].find((b) => b.textContent!.includes(text)) as HTMLButtonElement).click();
  const fill = (sel: string, v: string) => { const i = document.querySelector(sel) as HTMLInputElement; i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); };
  return { http, harness, el, doc, click, fill };
}

describe('Scripts page', () => {
  // load the script engine once, so the cold start does not depend on how busy the machine is
  beforeAll(async () => { (await ClientScriptRuntime.create([])).dispose(); }, 60000);

  it('lists scripts with kind, event, order, switch and version', async () => {
    const { el } = await render([SCRIPT(), SCRIPT({ id: 's2', kind: 'client', name: 'ui_rule', event: null, enabled: false, version: 3 })]);
    const rows = [...el().querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('no_negative');
    expect(rows[0].textContent).toContain('before_save');
    expect((rows[1].querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(rows[1].textContent).toContain('3');
    expect(rows[1].textContent).not.toContain('core.scripts.logs'); // client scripts have no server logs
  });

  it('creates a server script from the template and sends every field', async () => {
    const { http, harness, el, click, fill } = await render([]);
    click(el(), 'core.scripts.newServer');
    harness.detectChanges();
    fill('#sc-name', 'upper_title');
    (document.querySelector('#sc-event') as HTMLSelectElement).value = 'before_save';
    fill('#sc-code', 'doc.data.title = doc.data.title.toUpperCase();');
    harness.detectChanges();
    click(document.body, 'common.save');
    const post = http.expectOne(`${T}/scripts`);
    expect(post.request.body).toEqual({ name: 'upper_title', code: 'doc.data.title = doc.data.title.toUpperCase();', enabled: true, order: 100, description: '', event: 'before_save', doctype: 'asset', kind: 'server' });
    post.flush({ data: SCRIPT({ id: 'new1', name: 'upper_title' }) }, { status: 201, statusText: 'Created' });
    http.expectOne((r) => r.url === `${T}/scripts`).flush({ data: [SCRIPT({ id: 'new1', name: 'upper_title' })] });
    harness.detectChanges();
    expect(document.querySelector('#sc-test-title')).not.toBeNull(); // stays open, so it can be tested straight away
  });

  it('lists every problem the server found in a refused script', async () => {
    const { http, harness, el, click, fill } = await render([]);
    click(el(), 'core.scripts.newClient');
    harness.detectChanges();
    fill('#sc-name', 'Bad Name');
    fill('#sc-code', 'frm.on(');
    click(document.body, 'common.save');
    http.expectOne(`${T}/scripts`).flush({ message: 'x', errors: { name: ['Use lowercase letters, digits and underscores, starting with a letter (max 64).'], code: ['unexpected token (line 1)'] } }, { status: 422, statusText: 'Unprocessable' });
    harness.detectChanges();
    const text = document.querySelector('app-modal .alert-danger')!.textContent!;
    expect(text).toContain('name: Use lowercase letters');
    expect(text).toContain('code: unexpected token (line 1)');
  });

  it('runs a server test on the sample record and shows the outcome, messages, log and resulting data', async () => {
    const { http, harness, el, click, fill } = await render([SCRIPT()]);
    click(el(), 'common.edit');
    harness.detectChanges();
    fill('#sc-sample', '{ "title": "x", "amount": -1 }');
    click(document.body, 'core.scripts.run');
    const req = http.expectOne(`${T}/scripts/s1/test`);
    expect(req.request.body).toEqual({ doc: { data: { title: 'x', amount: -1 } } });
    req.flush({ data: { ok: false, kind: 'validation', message: 'no', messages: ['m1'], logs: ['seen x'], durationMs: 3 } });
    harness.detectChanges();
    const out = document.querySelector('[data-testid="test-result"]')!.textContent!;
    expect(out).toContain('validation');
    expect(out).toContain('no');
    expect(out).toContain('m1');
    expect(out).toContain('seen x');
  });

  it('refuses a sample that is not a JSON object without calling the server', async () => {
    const { http, harness, el, click, fill } = await render([SCRIPT()]);
    click(el(), 'common.edit');
    harness.detectChanges();
    fill('#sc-sample', '[1, 2');
    click(document.body, 'core.scripts.run');
    http.expectNone(`${T}/scripts/s1/test`);
    harness.detectChanges();
    expect(document.querySelector('[data-testid="test-result"]')!.textContent).toContain('core.scripts.badSample');
  });

  it('tests a client script in the browser sandbox and reports what it would do or what is wrong', async () => {
    const { harness, el, click, fill } = await render([SCRIPT({ id: 'c1', kind: 'client', name: 'ui', event: null, code: 'frm.on("refresh", () => { frm.toggle("amount", false); frm.msg("hi"); });' })]);
    click(el(), 'common.edit');
    harness.detectChanges();
    click(document.body, 'core.scripts.run');
    await tick(400);
    harness.detectChanges();
    const ok = document.querySelector('[data-testid="test-result"]')!.textContent!;
    expect(ok).toContain('core.scripts.passed');
    expect(ok).toContain('hi');
    expect(ok).toContain('hide amount');
    fill('#sc-code', 'frm.on("whenever", () => {});');
    harness.detectChanges();
    click(document.body, 'core.scripts.run');
    await tick(400);
    harness.detectChanges();
    expect(document.querySelector('[data-testid="test-result"]')!.textContent).toContain('whenever');
  });

  it('switches a script off and on, and deletes after confirmation', async () => {
    const { http, harness, el, click } = await render([SCRIPT()]);
    (el().querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    const put = http.expectOne(`${T}/scripts/s1`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ enabled: false });
    put.flush({ data: SCRIPT({ enabled: false }) });
    http.expectOne((r) => r.url === `${T}/scripts`).flush({ data: [SCRIPT({ enabled: false })] });
    harness.detectChanges();
    click(el(), 'common.delete');
    harness.detectChanges();
    http.expectNone(`${T}/scripts/s1`);
    ([...document.querySelectorAll('app-confirm-dialog button')].find((b) => b.classList.contains('btn-danger')) as HTMLButtonElement).click();
    const del = http.expectOne(`${T}/scripts/s1`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne((r) => r.url === `${T}/scripts`).flush({ data: [] });
  });

  it('shows the recent runs of a server script', async () => {
    const { http, harness, el, click } = await render([SCRIPT()]);
    click(el(), 'core.scripts.logs');
    http.expectOne(`${T}/scripts/s1/logs`).flush({ data: [{ at: '2026-10-15T08:00:00Z', event: 'before_save', record: 'ASSET-000001', ok: false, kind: 'error', message: 'boom', durationMs: 4, logs: ['seen'], messages: [] }] });
    harness.detectChanges();
    const row = document.querySelector('app-modal tbody tr')!.textContent!;
    expect(row).toContain('ASSET-000001');
    expect(row).toContain('boom');
    expect(row).toContain('seen');
  });

  it('says so when the page cannot load', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter([{ path: 'doctypes/:name/scripts', component: ScriptsPage }])] });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('doctypes/asset/scripts', ScriptsPage);
    await tick();
    http.expectOne(`${T}/meta/asset`).flush('no', { status: 403, statusText: 'Forbidden' });
    http.match(`${T}/scripts?doctype=asset`);
    await nav;
    harness.detectChanges();
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('core.loadFailed');
  });
});
