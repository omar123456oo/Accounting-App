import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DocTypeMeta } from './core.models';
import { InboxPage } from './inbox-page';
import { RecordForm } from './record-form';
import { WorkflowEditor } from './workflow-editor';
import { WorkflowBlock } from './workflow.models';

const META: DocTypeMeta = {
  name: 'expense_req', label: 'Expense request', module: 'finance', isCustom: true, titleField: 'title', canManage: true,
  fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'text', required: true }, { fieldname: 'amount', label: 'Amount', fieldtype: 'currency', required: true }],
};
const block = (over: Partial<WorkflowBlock> = {}): WorkflowBlock => ({
  state: 'review', stateLabel: 'In review', editable: false,
  actions: [{ action: 'approve', label: 'Approve', requireComment: false }, { action: 'reject', label: 'Reject', requireComment: true }],
  history: [{ at: '2026-10-14T10:00:00Z', actor: 'u1', actorName: 'accountant', action: 'submit', from: 'draft', to: 'review', comment: null, onBehalfOf: null }],
  ...over,
});
const REC = (wf: WorkflowBlock) => ({ name: 'EXPENSE-REQ-000001', title: 'Laptops', data: { title: 'Laptops', amount: 250 }, workflow: wf });

async function open<T>(url: string, component: new () => T, route: string) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService(), provideRouter([{ path: route, component }])] });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  return { http, harness, el: () => harness.routeNativeElement as HTMLElement, go: () => harness.navigateByUrl(url, component) };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const T = '/api/v1/staff/core';

describe('Record form with a workflow', () => {
  async function render(wf: WorkflowBlock, canManage = true) {
    const o = await open('records/expense_req/EXPENSE-REQ-000001', RecordForm, 'records/:doctype/:name');
    const nav = o.go();
    await tick();
    o.http.expectOne(`${T}/meta/expense_req`).flush({ data: { ...META, canManage } });
    o.http.expectOne(`${T}/records/expense_req/EXPENSE-REQ-000001`).flush({ data: REC(wf) });
    await nav;
    o.harness.detectChanges();
    return o;
  }

  it('shows the state, history and the actions offered, and locks the form in a locked state', async () => {
    const { el } = await render(block());
    expect(el().querySelector('[data-testid="wf-state"]')!.textContent).toContain('In review');
    expect(el().textContent).toContain('accountant');
    expect([...el().querySelectorAll('.card button.btn')].map((b) => b.textContent!.trim())).toEqual(expect.arrayContaining(['Approve', 'Reject']));
    expect((el().querySelector('#f-title') as HTMLInputElement).disabled).toBe(true);
    expect(el().querySelector('form button[type="submit"]')).toBeNull();
    expect(el().textContent).not.toContain('common.delete');
  });

  it('keeps the form editable in an editable state for people who can manage', async () => {
    const { el } = await render(block({ state: 'draft', stateLabel: 'Draft', editable: true, actions: [{ action: 'submit', label: 'Submit', requireComment: false }] }));
    expect((el().querySelector('#f-title') as HTMLInputElement).disabled).toBe(false);
    expect(el().querySelector('form button[type="submit"]')).not.toBeNull();
  });

  it('refuses an action that needs a comment until one is written, then sends it', async () => {
    const { http, el, harness } = await render(block());
    const reject = [...el().querySelectorAll('.card button.btn')].find((b) => b.textContent!.trim() === 'Reject') as HTMLButtonElement;
    reject.click();
    harness.detectChanges();
    http.expectNone(`${T}/records/expense_req/EXPENSE-REQ-000001/actions`);
    expect(el().textContent).toContain('core.workflow.commentRequired');
    const box = el().querySelector('#wf-comment') as HTMLTextAreaElement;
    box.value = 'No budget';
    box.dispatchEvent(new Event('input'));
    reject.click();
    const req = http.expectOne(`${T}/records/expense_req/EXPENSE-REQ-000001/actions`);
    expect(req.request.body).toEqual({ action: 'reject', comment: 'No budget' });
    req.flush({ data: REC(block({ state: 'rejected', stateLabel: 'Rejected', actions: [] })) });
    harness.detectChanges();
    expect(el().querySelector('[data-testid="wf-state"]')!.textContent).toContain('Rejected');
    expect(el().querySelector('#wf-comment')).toBeNull();
  });

  it('tells the person how many approvals are still needed when the record stays where it is', async () => {
    const { http, el, harness } = await render(block());
    ([...el().querySelectorAll('.card button.btn')].find((b) => b.textContent!.trim() === 'Approve') as HTMLButtonElement).click();
    http.expectOne(`${T}/records/expense_req/EXPENSE-REQ-000001/actions`).flush({ data: REC(block({ actions: [] })), pending: 1 });
    harness.detectChanges();
    expect(el().textContent).toContain('core.workflow.pending');
    expect(el().querySelector('[data-testid="wf-state"]')!.textContent).toContain('In review');
  });

  it('shows the server message when an action is refused and keeps the buttons', async () => {
    const { http, el, harness } = await render(block());
    ([...el().querySelectorAll('.card button.btn')].find((b) => b.textContent!.trim() === 'Approve') as HTMLButtonElement).click();
    http.expectOne(`${T}/records/expense_req/EXPENSE-REQ-000001/actions`).flush({ message: 'This record was changed by someone else. Reload and try again.' }, { status: 409, statusText: 'Conflict' });
    harness.detectChanges();
    expect(el().textContent).toContain('changed by someone else');
    expect([...el().querySelectorAll('.card button.btn')].map((b) => b.textContent!.trim())).toContain('Approve');
  });
});

describe('Workflow editor', () => {
  const DIR = { roles: ['accountant', 'owner'], users: [{ id: 'u1', name: 'Karim', roles: ['accountant'] }] };
  async function render(existing: unknown = null) {
    const o = await open('doctypes/expense_req/workflow', WorkflowEditor, 'doctypes/:name/workflow');
    const nav = o.go();
    await tick();
    o.http.expectOne(`${T}/meta/expense_req`).flush({ data: META });
    if (existing) o.http.expectOne(`${T}/workflows/expense_req`).flush({ data: existing });
    else o.http.expectOne(`${T}/workflows/expense_req`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    o.http.expectOne(`${T}/directory`).flush({ data: DIR });
    await nav;
    o.harness.detectChanges();
    return o;
  }
  const type = (el: HTMLElement, sel: string, v: string) => { const i = el.querySelector(sel) as HTMLInputElement; i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); };
  const click = (el: HTMLElement, text: string) => ([...el.querySelectorAll('button')].find((b) => b.textContent!.includes(text)) as HTMLButtonElement).click();

  it('starts a new workflow with a draft state and saves what was built', async () => {
    const { http, el, harness } = await render();
    expect(el().querySelectorAll('[id^="st-n-"]').length).toBe(1);
    click(el(), 'core.workflow.addState'); harness.detectChanges();
    type(el(), '#st-n-1', 'review'); type(el(), '#st-l-1', 'In review'); harness.detectChanges();
    click(el(), 'core.workflow.addTransition'); harness.detectChanges();
    type(el(), '#tr-a-0', 'submit'); type(el(), '#tr-l-0', 'Submit');
    (el().querySelector('#tr-r-0-accountant') as HTMLInputElement).click();
    click(el(), 'core.workflow.addCondition'); harness.detectChanges();
    type(el(), 'input[aria-label="core.workflow.value"]', '100');
    (el().querySelector('select[aria-label="core.workflow.operator"]') as HTMLSelectElement).value = 'lt';
    (el().querySelector('select[aria-label="core.workflow.operator"]') as HTMLSelectElement).dispatchEvent(new Event('change'));
    harness.detectChanges();
    click(el(), 'common.save');
    const put = http.expectOne(`${T}/workflows/expense_req`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toMatchObject({
      name: 'Expense request', active: true, initialState: 'draft',
      states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'review', label: 'In review', editable: false }],
      transitions: [{ from: 'draft', to: 'review', action: 'submit', label: 'Submit', allowedRoles: ['accountant'], approvals: 1, conditions: [{ field: 'title', op: 'lt', value: 100 }] }],
    });
    put.flush({ data: put.request.body });
    harness.detectChanges();
    expect(el().textContent).toContain('core.customize.saved');
  });

  it('keeps transitions and the initial state pointing at a renamed state', async () => {
    const existing = {
      name: 'W', active: true, initialState: 'draft', states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'review', label: 'Review', editable: false }],
      transitions: [{ from: 'draft', to: 'review', action: 'submit', label: 'Submit', allowedRoles: ['accountant'], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: false, conditions: [] }], escalations: [],
    };
    const { http, el, harness } = await render(existing);
    type(el(), '#st-n-0', 'new_draft'); harness.detectChanges();
    click(el(), 'common.save');
    const body = http.expectOne(`${T}/workflows/expense_req`).request.body;
    expect(body.initialState).toBe('new_draft');
    expect(body.transitions[0].from).toBe('new_draft');
    expect(body.states[0].name).toBe('new_draft');
  });

  it('changes the roles of the transition it was clicked in, not another one', async () => {
    const t = (action: string) => ({ from: 'draft', to: 'review', action, label: action, allowedRoles: [] as string[], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: false, conditions: [] });
    const existing = { name: 'W', active: true, initialState: 'draft', states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'review', label: 'Review', editable: false }], transitions: [t('one'), t('two')], escalations: [{ state: 'draft', afterHours: 5, notifyRoles: [], notifyUsers: [], remindApprovers: false }, { state: 'review', afterHours: 5, notifyRoles: [], notifyUsers: [], remindApprovers: false }] };
    const { http, el, harness } = await render(existing);
    expect(new Set([...el().querySelectorAll('[id^="tr-r-"]')].map((i) => i.id)).size).toBe(4); // two transitions x two roles, all different
    (el().querySelector('#tr-r-1-owner') as HTMLInputElement).click();
    (el().querySelector('#es-r-1-accountant') as HTMLInputElement).click();
    harness.detectChanges();
    click(el(), 'common.save');
    const body = http.expectOne(`${T}/workflows/expense_req`).request.body;
    expect(body.transitions.map((x: { allowedRoles: string[] }) => x.allowedRoles)).toEqual([[], ['owner']]);
    expect(body.escalations.map((x: { notifyRoles: string[] }) => x.notifyRoles)).toEqual([[], ['accountant']]);
  });

  it('lists every server problem when the save is refused and keeps the form', async () => {
    const { http, el, harness } = await render();
    click(el(), 'common.save');
    http.expectOne(`${T}/workflows/expense_req`).flush({ message: 'x', errors: { transitions: ['Transition 1 (): name at least one approver.'], states: ['Duplicate state "draft".'] } }, { status: 422, statusText: 'Unprocessable' });
    harness.detectChanges();
    const items = [...el().querySelectorAll('.alert-danger li')].map((l) => l.textContent);
    expect(items).toEqual(['Transition 1 (): name at least one approver.', 'Duplicate state "draft".']);
    expect(el().querySelectorAll('[id^="st-n-"]').length).toBe(1);
  });
});

describe('Inbox', () => {
  async function render() {
    const o = await open('inbox', InboxPage, 'inbox');
    const nav = o.go();
    await tick();
    o.http.expectOne(`${T}/workflow/inbox`).flush({ data: [{ doctype: 'expense_req', doctypeLabel: 'Expense request', name: 'EXPENSE-REQ-000002', title: 'Servers', state: 'review', stateLabel: 'In review', actions: [{ action: 'approve', label: 'Approve', requireComment: false }, { action: 'reject', label: 'Reject', requireComment: true }], since: '2026-10-14T10:00:00Z', route: '/app/records/expense_req/EXPENSE-REQ-000002' }] });
    o.http.expectOne(`${T}/workflow/delegations`).flush({ data: [{ id: 'd1', toUserId: 'u1', toName: 'Karim', startDate: '2026-10-14', endDate: '2026-10-20' }] });
    o.http.expectOne(`${T}/notifications`).flush({ data: [{ id: 'n1', kind: 'workflow', title: 'Expense request EXPENSE-REQ-000002: In review', body: null, link: '/app/records/expense_req/EXPENSE-REQ-000002', readAt: null, createdAt: '2026-10-14T10:00:00Z' }] });
    o.http.expectOne(`${T}/people`).flush({ data: [{ id: 'u1', name: 'Karim' }, { id: 'u2', name: 'Mona' }] });
    await nav;
    o.harness.detectChanges();
    return o;
  }

  it('lists what is waiting with the actions available', async () => {
    const { el } = await render();
    const row = el().querySelector('tbody tr')!;
    expect(row.textContent).toContain('EXPENSE-REQ-000002');
    expect(row.textContent).toContain('Servers');
    expect(row.textContent).toContain('Approve, Reject');
  });

  it('adds a delegation with the chosen colleague and dates, and ends one', async () => {
    const { http, el, harness } = await render();
    (el().querySelector('#dg-to') as HTMLSelectElement).value = 'u2';
    (el().querySelector('#dg-to') as HTMLSelectElement).dispatchEvent(new Event('change'));
    (el().querySelector('#dg-from') as HTMLInputElement).value = '2026-11-01';
    (el().querySelector('#dg-from') as HTMLInputElement).dispatchEvent(new Event('input'));
    (el().querySelector('#dg-end') as HTMLInputElement).value = '2026-11-05';
    (el().querySelector('#dg-end') as HTMLInputElement).dispatchEvent(new Event('input'));
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const post = http.expectOne(`${T}/workflow/delegations`);
    expect(post.request.body).toEqual({ toUserId: 'u2', startDate: '2026-11-01', endDate: '2026-11-05' });
    post.flush({ data: { id: 'd2', toUserId: 'u2', toName: 'Mona', startDate: '2026-11-01', endDate: '2026-11-05' } });
    harness.detectChanges();
    expect(el().textContent).toContain('Mona');
    ([...el().querySelectorAll('button')].find((b) => b.textContent!.includes('core.inbox.endDelegation')) as HTMLButtonElement).click();
    const del = http.expectOne((r) => r.method === 'DELETE' && r.url.startsWith(`${T}/workflow/delegations/`));
    del.flush(null, { status: 204, statusText: 'No Content' });
    harness.detectChanges();
  });

  it('shows the server message when a delegation is refused', async () => {
    const { http, el, harness } = await render();
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne(`${T}/workflow/delegations`).flush({ message: 'x', errors: { toUserId: ['Choose a person.'] } }, { status: 422, statusText: 'Unprocessable' });
    harness.detectChanges();
    expect(el().textContent).toContain('Choose a person.');
  });

  it('marks a notification as read', async () => {
    const { http, el, harness } = await render();
    expect(el().querySelector('.list-group-item.fw-semibold')).not.toBeNull();
    ([...el().querySelectorAll('.list-group button')].find((b) => b.textContent!.includes('core.inbox.markRead')) as HTMLButtonElement).click();
    http.expectOne(`${T}/notifications/n1/read`).flush({ data: { id: 'n1', readAt: '2026-10-14T11:00:00Z' } });
    harness.detectChanges();
    expect(el().querySelector('.list-group-item.fw-semibold')).toBeNull();
  });
});
