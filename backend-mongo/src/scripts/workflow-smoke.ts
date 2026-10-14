// Acceptance test for the workflow engine: rules (pure), then the HTTP behaviour on an in-memory MongoDB.
import assert from 'node:assert/strict';
import { conditionsHold, validateDefinition, type WorkflowDef } from '../core/workflow-rules.js';

// ---- pure: conditions --------------------------------------------------------------------------------------------------
const c = (field: string, op: any, value: unknown) => ({ field, op, value });
assert.equal(conditionsHold([], {}), true, 'no conditions always hold');
assert.equal(conditionsHold([c('amount', 'lt', 100)], { amount: 50 }), true);
assert.equal(conditionsHold([c('amount', 'lt', 100)], { amount: 100 }), false);
assert.equal(conditionsHold([c('amount', 'lte', 100)], { amount: 100 }), true);
assert.equal(conditionsHold([c('amount', 'gt', 100)], { amount: 101 }), true);
assert.equal(conditionsHold([c('amount', 'gte', 100)], { amount: 99.99 }), false);
assert.equal(conditionsHold([c('status', 'eq', 'new')], { status: 'new' }), true);
assert.equal(conditionsHold([c('status', 'ne', 'new')], { status: 'used' }), true);
assert.equal(conditionsHold([c('status', 'in', ['a', 'b'])], { status: 'b' }), true);
assert.equal(conditionsHold([c('status', 'in', ['a', 'b'])], { status: 'c' }), false);
assert.equal(conditionsHold([c('amount', 'lt', 100)], {}), false, 'a missing number never satisfies a comparison');
assert.equal(conditionsHold([c('amount', 'lt', 100)], { amount: '5' }), false, 'a string is not a number');
assert.equal(conditionsHold([c('amount', 'lt', 100), c('status', 'eq', 'new')], { amount: 5, status: 'used' }), false, 'all conditions must hold');

// ---- pure: definition validation -----------------------------------------------------------------------------------------
const baseDef = (): WorkflowDef => ({
  states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'review', label: 'Review', editable: false }, { name: 'done', label: 'Done', editable: false }],
  initialState: 'draft',
  transitions: [
    { from: 'draft', to: 'review', action: 'submit', label: 'Submit', allowedRoles: ['accountant'], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: false, conditions: [] },
    { from: 'review', to: 'done', action: 'approve', label: 'Approve', allowedRoles: ['owner'], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: true, conditions: [] },
  ],
  escalations: [],
});
const fields = ['amount', 'status'];
const problems = (mutate: (d: WorkflowDef) => void): string[] => { const d = baseDef(); mutate(d); return Object.values(validateDefinition(d, fields)).flat(); };
assert.deepEqual(validateDefinition(baseDef(), fields), {});
assert.ok(problems((d) => { d.initialState = 'nope'; }).some((m) => /initial/i.test(m)));
assert.ok(problems((d) => { d.states.push({ name: 'draft', label: 'Again', editable: false }); }).some((m) => /duplicate state/i.test(m)));
assert.ok(problems((d) => { d.states[0].name = 'Bad Name'; }).some((m) => /state name/i.test(m)));
assert.ok(problems((d) => { d.transitions[0].to = 'ghost'; }).some((m) => /unknown state/i.test(m)));
assert.ok(problems((d) => { d.transitions[0].allowedRoles = []; }).some((m) => /approver/i.test(m)));
assert.ok(problems((d) => { d.transitions[0].approvals = 0; }).some((m) => /approvals/i.test(m)));
assert.ok(problems((d) => { d.transitions[0].approvals = 11; }).some((m) => /approvals/i.test(m)));
assert.deepEqual(problems((d) => { d.transitions.push({ ...d.transitions[0], to: 'done', conditions: [{ field: 'amount', op: 'lt', value: 100 }] }); }), [], 'the same action from a state may lead elsewhere when conditions differ');
assert.ok(problems((d) => { d.transitions.push({ ...d.transitions[0] }); }).some((m) => /twice|duplicate transition/i.test(m)), 'identical unconditional transition twice is ambiguous');
assert.ok(problems((d) => { d.transitions[0].conditions = [{ field: 'ghost', op: 'eq', value: 1 }]; }).some((m) => /unknown field/i.test(m)));
assert.ok(problems((d) => { d.transitions[0].conditions = [{ field: 'amount', op: 'like' as any, value: 1 }]; }).some((m) => /operator/i.test(m)));
assert.ok(problems((d) => { d.transitions[0].conditions = [{ field: 'amount', op: 'in', value: 5 }]; }).some((m) => /list/i.test(m)));
assert.ok(problems((d) => { d.escalations = [{ state: 'ghost', afterHours: 5, notifyRoles: ['owner'], notifyUsers: [], remindApprovers: false }]; }).some((m) => /unknown state/i.test(m)));
assert.ok(problems((d) => { d.escalations = [{ state: 'review', afterHours: 0, notifyRoles: ['owner'], notifyUsers: [], remindApprovers: false }]; }).some((m) => /afterHours|hours/i.test(m)));
assert.ok(problems((d) => { d.escalations = [{ state: 'review', afterHours: 5, notifyRoles: [], notifyUsers: [], remindApprovers: false }]; }).some((m) => /notify/i.test(m)));
assert.ok(problems((d) => { d.states = []; }).length > 0);

console.log('workflow-smoke: pure checks passed');

// ---- database and HTTP ---------------------------------------------------------------------------------------------------
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const { DocRecord } = await import('../core/models.js');
const { Workflow, Notification } = await import('../core/workflow.models.js');
const { runEscalations } = await import('../core/workflow.service.js');
const { Organization, Role, User } = await import('../models/index.js');
const { hashPassword } = await import('../auth/password.js');
const { roleMatrix } = await import('../db/permissions.js');
const { verifyChain } = await import('../db/audit-chain.js');
const { AuditEvent } = await import('../models/audit-event.js');
await connectDb();
const { password, org } = await seed();
const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;

class Client {
  jar = new Map<string, string>();
  async call(method: string, path: string, body?: unknown) {
    const x = this.jar.get('XSRF-TOKEN');
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'accept-language': 'en', cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(x && { 'x-xsrf-token': x }) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }
  static async login(email: string, pw: string) {
    const cl = new Client();
    await cl.call('GET', '/sanctum/csrf-cookie');
    assert.equal((await cl.call('POST', '/api/v1/auth/login', { email, password: pw })).status, 200, email);
    return cl;
  }
  static as = (role: string) => Client.login(`demo.${role}@demo.test`, password);
}
const C = '/api/v1/staff/core';
const uid = async (role: string) => String((await User.findOne({ email: `demo.${role}@demo.test` }).lean())!._id);

try {
  const owner = await Client.as('owner');
  const accountant = await Client.as('accountant');
  const chief = await Client.as('chief_accountant');
  const office = await Client.as('office_manager');
  const tax = await Client.as('tax_specialist');
  const sales = await Client.as('sales');
  const readonly = await Client.as('read_only');
  const taxId = await uid('tax_specialist');
  const salesId = await uid('sales');
  const ownerId = await uid('owner');
  const accountantId = await uid('accountant');

  const other = await Organization.create({ name: 'Other Office' });
  await Role.create({ organizationId: other._id, name: 'owner', permissions: roleMatrix().owner });
  const otherUser = await User.create({ organizationId: other._id, name: 'o', email: 'owner@other.test', passwordHash: await hashPassword(password), type: 'staff', roles: ['owner'], emailVerifiedAt: new Date() });
  const outsider = await Client.login('owner@other.test', password);

  const T = 'expense_req';
  assert.equal((await owner.call('POST', `${C}/doctypes`, {
    name: T, label: 'Expense request', module: 'finance', titleField: 'title', searchFields: ['title'], viewPermission: 'clients.view', managePermission: 'clients.update',
    fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'text', required: true }, { fieldname: 'amount', label: 'Amount', fieldtype: 'currency', required: true }],
  })).status, 201);

  const tr = (from: string, to: string, action: string, extra: Record<string, unknown> = {}) => ({
    from, to, action, label: action, allowedRoles: [], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: false, conditions: [], ...extra,
  });
  const definition = () => ({
    active: true, name: 'Expense approval', initialState: 'draft',
    states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'review', label: 'In review', editable: false }, { name: 'approved', label: 'Approved', editable: false }, { name: 'rejected', label: 'Rejected', editable: false }, { name: 'cancelled', label: 'Cancelled', editable: false }],
    transitions: [
      tr('draft', 'review', 'submit', { allowedRoles: ['accountant', 'owner'] }),
      tr('draft', 'cancelled', 'cancel', { allowedRoles: ['accountant', 'owner'] }),
      tr('review', 'approved', 'approve', { allowedRoles: ['chief_accountant', 'owner'], approvals: 2, preventSelfApproval: true }),
      tr('review', 'approved', 'fast_approve', { allowedRoles: ['office_manager'], conditions: [{ field: 'amount', op: 'lt', value: 100 }] }),
      tr('review', 'rejected', 'reject', { allowedRoles: ['chief_accountant', 'owner'], requireComment: true }),
      tr('review', 'draft', 'return', { allowedRoles: ['chief_accountant', 'owner'], requireComment: true }),
      tr('rejected', 'draft', 'reopen', { allowedUsers: [taxId] }),
    ],
    escalations: [{ state: 'review', afterHours: 24, notifyRoles: ['owner'], notifyUsers: [], remindApprovers: true }],
  });
  const W = `${C}/workflows/${T}`;

  // ---- definition API ------------------------------------------------------------------------------------------------------
  assert.equal((await owner.call('GET', W)).status, 404, 'no workflow yet');
  assert.equal((await accountant.call('PUT', W, definition())).status, 403);
  const putBad = async (mutate: (d: any) => void, field: string) => { const d: any = definition(); mutate(d); const r = await owner.call('PUT', W, d); assert.equal(r.status, 422, JSON.stringify(r.json)); assert.ok(r.json.errors[field], `${field}: ${JSON.stringify(r.json.errors)}`); };
  await putBad((d) => { d.initialState = 'nope'; }, 'initialState');
  await putBad((d) => { d.transitions[0].allowedRoles = ['ghost_role']; }, 'transitions');
  await putBad((d) => { d.transitions[6].allowedUsers = [String(otherUser._id)]; }, 'transitions');
  await putBad((d) => { d.transitions[6].allowedUsers = ['not-an-id']; }, 'transitions');
  await putBad((d) => { d.transitions[2].conditions = [{ field: 'ghost', op: 'eq', value: 1 }]; }, 'transitions');
  await putBad((d) => { d.escalations.push({ state: 'review', afterHours: 48, notifyRoles: ['owner'], notifyUsers: [], remindApprovers: false }); }, 'escalations');
  assert.equal((await owner.call('PUT', `${C}/workflows/leave_request`, definition())).status, 404, 'built-in types have no record store here');
  assert.equal((await owner.call('PUT', `${C}/workflows/nope`, definition())).status, 404);
  assert.equal((await outsider.call('PUT', W, definition())).status, 404, 'another organization has no such type');
  assert.equal(await Workflow.countDocuments({ organizationId: org._id }), 0, 'failed saves stored nothing');

  // a record that exists before the workflow does
  const R = `${C}/records/${T}`;
  const early = (await accountant.call('POST', R, { data: { title: 'Early', amount: 10 } })).json.data;
  assert.equal(early.workflow, undefined, 'no workflow, no workflow block');

  assert.equal((await owner.call('PUT', W, definition())).status, 200);
  assert.equal((await owner.call('GET', W)).json.data.initialState, 'draft');
  assert.equal((await accountant.call('GET', W)).status, 403);

  // records that existed before the workflow start in its initial state
  const earlyView = (await accountant.call('GET', `${R}/${early.name}`)).json.data;
  assert.equal(earlyView.workflow.state, 'draft');
  assert.deepEqual(earlyView.workflow.actions.map((a: any) => a.action).sort(), ['cancel', 'submit']);

  const act = (c: Client, name: string, action: string, comment?: string) => c.call('POST', `${R}/${name}/actions`, { action, ...(comment !== undefined ? { comment } : {}) });
  const view = async (c: Client, name: string) => (await c.call('GET', `${R}/${name}`)).json.data;
  const mk = async (c: Client, amount: number, title = 'Req') => (await c.call('POST', R, { data: { title, amount } })).json.data.name as string;

  // ---- main path: submit, parallel approval, history ---------------------------------------------------------------------
  const r1 = await mk(accountant, 250, 'Laptops');
  const v1 = await view(accountant, r1);
  assert.equal(v1.workflow.state, 'draft');
  assert.equal(v1.workflow.stateLabel, 'Draft');
  assert.deepEqual(v1.workflow.actions.map((a: any) => a.action).sort(), ['cancel', 'submit']);
  assert.deepEqual((await view(tax, r1)).workflow.actions, [], 'a viewer with no eligibility is offered nothing');
  assert.equal((await act(tax, r1, 'submit')).status, 403);
  assert.equal((await act(accountant, r1, 'approve')).status, 422, 'not a transition from draft');
  assert.equal((await accountant.call('PUT', `${R}/${r1}`, { data: { amount: 260 } })).status, 200, 'draft is editable');
  assert.equal((await act(accountant, r1, 'submit')).status, 200);
  const afterSubmit = await view(accountant, r1);
  assert.equal(afterSubmit.workflow.state, 'review');
  assert.equal((await accountant.call('PUT', `${R}/${r1}`, { data: { amount: 1 } })).status, 409, 'review is not editable');
  assert.equal((await accountant.call('DELETE', `${R}/${r1}`)).status, 409);
  assert.equal((await owner.call('DELETE', `${R}/${r1}`)).status, 409, 'even the owner cannot delete a record in review');
  assert.equal((await act(accountant, r1, 'approve')).status, 403, 'the submitter is not an approver');

  const first = await act(chief, r1, 'approve');
  assert.equal(first.status, 200);
  assert.equal(first.json.pending, 1, 'one more approval needed');
  assert.equal((await view(chief, r1)).workflow.state, 'review');
  assert.equal((await act(chief, r1, 'approve')).status, 422, 'the same person cannot approve twice');
  const second = await act(owner, r1, 'approve', 'looks fine');
  assert.equal(second.status, 200);
  assert.equal(second.json.data.workflow.state, 'approved');
  assert.equal(second.json.pending, undefined);
  assert.equal((await act(chief, r1, 'approve')).status, 422, 'nothing more to approve');
  const hist = (await view(owner, r1)).workflow.history;
  assert.deepEqual(hist.map((h: any) => [h.action, h.from, h.to]), [['created', null, 'draft'], ['submit', 'draft', 'review'], ['approve', 'review', 'review'], ['approve', 'review', 'approved']]);
  assert.equal(hist[3].comment, 'looks fine');
  assert.ok(hist.every((h: any) => h.actorName && h.at), 'history names who and when');
  assert.equal((await owner.call('PUT', `${R}/${r1}`, { data: { amount: 1 } })).status, 409, 'approved records are locked');

  // ---- notifications ------------------------------------------------------------------------------------------------------
  const chiefNotes = (await chief.call('GET', `${C}/notifications`)).json.data;
  const ofR1 = chiefNotes.filter((n: any) => n.link === `/app/records/${T}/${r1}`);
  assert.ok(ofR1.length >= 1, 'approvers are told when a record reaches review');
  assert.equal((await tax.call('GET', `${C}/notifications`)).json.data.filter((n: any) => n.link === `/app/records/${T}/${r1}`).length, 0, 'people who cannot act are not told');
  const creatorNotes = (await accountant.call('GET', `${C}/notifications`)).json.data.filter((n: any) => n.link === `/app/records/${T}/${r1}`);
  assert.ok(creatorNotes.length >= 1, 'the creator is told when the record is approved');
  assert.ok(chiefNotes[0].readAt === null || chiefNotes[0].readAt === undefined);
  const nid = ofR1[0].id;
  assert.equal((await tax.call('POST', `${C}/notifications/${nid}/read`)).status, 404, "nobody can mark someone else's notification");
  assert.equal((await chief.call('POST', `${C}/notifications/${nid}/read`)).status, 200);
  assert.ok((await chief.call('GET', `${C}/notifications`)).json.data.find((n: any) => n.id === nid).readAt);
  assert.ok((await chief.call('GET', `${C}/notifications?unread=1`)).json.data.every((n: any) => !n.readAt));

  // ---- conditions ---------------------------------------------------------------------------------------------------------
  const small = await mk(accountant, 50, 'Pens');
  await act(accountant, small, 'submit');
  assert.deepEqual((await view(office, small)).workflow.actions.map((a: any) => a.action), ['fast_approve'], 'offered only when the amount condition holds');
  assert.equal((await act(office, small, 'fast_approve')).json.data.workflow.state, 'approved');
  const big = await mk(accountant, 500, 'Servers');
  await act(accountant, big, 'submit');
  assert.deepEqual((await view(office, big)).workflow.actions, []);
  assert.equal((await act(office, big, 'fast_approve')).status, 422);

  // ---- separation of duties ------------------------------------------------------------------------------------------------
  const own = await mk(owner, 300, 'Owner request');
  assert.equal((await act(owner, own, 'submit')).status, 200);
  assert.equal((await act(owner, own, 'approve')).status, 403, 'the creator cannot approve their own record');
  assert.deepEqual((await view(owner, own)).workflow.actions.map((a: any) => a.action).sort(), ['reject', 'return'], 'approve is not offered to the creator');
  assert.equal((await act(chief, own, 'approve')).status, 200, 'someone else can');

  // ---- comments, reject, return, user-based reopen ----------------------------------------------------------------------
  const rj = await mk(accountant, 400, 'Disputed');
  await act(accountant, rj, 'submit');
  const noComment = await act(chief, rj, 'reject');
  assert.equal(noComment.status, 422);
  assert.ok(noComment.json.errors.comment);
  assert.equal((await act(chief, rj, 'reject', '   ')).status, 422, 'blank is not a comment');
  const rejected = await act(chief, rj, 'reject', 'No budget');
  assert.equal(rejected.json.data.workflow.state, 'rejected');
  assert.equal(rejected.json.data.workflow.history.at(-1).comment, 'No budget');
  assert.equal((await act(owner, rj, 'reopen')).status, 403, 'reopen names one person, not a role');
  assert.equal((await act(tax, rj, 'reopen')).json.data.workflow.state, 'draft');
  assert.equal((await accountant.call('PUT', `${R}/${rj}`, { data: { amount: 399 } })).status, 200, 'editable again after reopening');
  await act(accountant, rj, 'submit');
  const returned = await act(chief, rj, 'return', 'Please add the quote');
  assert.equal(returned.json.data.workflow.state, 'draft');
  assert.equal((await accountant.call('PUT', `${R}/${rj}`, { data: { amount: 398 } })).status, 200);

  // ---- concurrency ----------------------------------------------------------------------------------------------------------
  const race = await mk(accountant, 70, 'Race');
  const results = await Promise.all([act(accountant, race, 'submit'), act(owner, race, 'submit')]);
  assert.equal(results.filter((r) => r.status === 200).length, 1, 'exactly one submit wins');
  assert.ok([409, 422].includes(results.find((r) => r.status !== 200)!.status));
  assert.equal((await view(owner, race)).workflow.history.filter((h: any) => h.action === 'submit').length, 1);

  // ---- cancel ----------------------------------------------------------------------------------------------------------------
  const cx = await mk(accountant, 5, 'Cancel me');
  assert.equal((await act(accountant, cx, 'cancel')).json.data.workflow.state, 'cancelled');
  assert.equal((await act(accountant, cx, 'submit')).status, 422);

  // ---- delegation ------------------------------------------------------------------------------------------------------------
  const dl = await mk(accountant, 20, 'Delegated');
  assert.equal((await act(sales, dl, 'submit')).status, 403, 'sales is not eligible');
  const D = `${C}/workflow/delegations`;
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const badDel = async (c: Client, body: unknown) => assert.equal((await c.call('POST', D, body)).status, 422, JSON.stringify(body));
  await badDel(accountant, { toUserId: accountantId, startDate: day(0), endDate: day(1) });
  await badDel(accountant, { toUserId: '0'.repeat(24), startDate: day(0), endDate: day(1) });
  await badDel(accountant, { toUserId: String(otherUser._id), startDate: day(0), endDate: day(1) });
  await badDel(accountant, { toUserId: salesId, startDate: day(2), endDate: day(1) });
  await badDel(accountant, { toUserId: salesId, startDate: 'soon', endDate: day(1) });
  const expired = await accountant.call('POST', D, { toUserId: salesId, startDate: '2020-01-01', endDate: '2020-01-02' });
  assert.equal(expired.status, 201);
  assert.equal((await act(sales, dl, 'submit')).status, 403, 'an expired delegation grants nothing');
  const del = await accountant.call('POST', D, { toUserId: salesId, startDate: day(-1), endDate: day(1) });
  assert.equal(del.status, 201);
  assert.equal((await sales.call('DELETE', `${D}/${del.json.data.id}`)).status, 404, "only the delegator can end it");
  assert.deepEqual((await accountant.call('GET', D)).json.data.map((d: any) => d.toUserId).sort(), [salesId, salesId], 'lists my delegations');
  assert.equal((await sales.call('GET', D)).json.data.length, 0, 'the delegate does not see them as their own');
  const viaDelegate = await act(sales, dl, 'submit');
  assert.equal(viaDelegate.status, 200, 'acts with the accountant\'s eligibility');
  const lastHist = viaDelegate.json.data.workflow.history.at(-1);
  assert.equal(lastHist.onBehalfOf, 'accountant', 'the history says on whose behalf');
  assert.equal((await accountant.call('DELETE', `${D}/${del.json.data.id}`)).status, 204);
  const dl2 = await mk(accountant, 21, 'After delegation');
  assert.equal((await act(sales, dl2, 'submit')).status, 403, 'ending a delegation takes effect at once');
  // a delegation cannot be used to approve the delegator's own record
  assert.equal((await owner.call('POST', D, { toUserId: accountantId, startDate: day(-1), endDate: day(1) })).status, 201);
  const ownDeleg = await mk(owner, 600, 'Owner again');
  await act(owner, ownDeleg, 'submit');
  assert.equal((await act(accountant, ownDeleg, 'approve')).status, 403, 'acting for the creator is still self-approval');

  // ---- inbox -----------------------------------------------------------------------------------------------------------------
  const inbox = (await chief.call('GET', `${C}/workflow/inbox`)).json.data;
  assert.ok(inbox.length >= 1);
  assert.ok(inbox.every((i: any) => i.doctype === T && i.state === 'review' && i.actions.length > 0), 'only records the caller can act on');
  assert.ok(inbox.some((i: any) => i.name === big), 'a pending record shows up');
  assert.ok(!inbox.some((i: any) => i.name === r1), 'decided records do not');
  assert.deepEqual((await readonly.call('GET', `${C}/workflow/inbox`)).json.data, []);
  assert.deepEqual((await outsider.call('GET', `${C}/workflow/inbox`)).json.data, []);

  // ---- tenant isolation ------------------------------------------------------------------------------------------------------
  assert.equal((await act(outsider, r1, 'submit')).status, 404);

  // ---- escalation and reminders --------------------------------------------------------------------------------------------
  const esc = await mk(accountant, 33, 'Slow one');
  await act(accountant, esc, 'submit');
  const entered = (await DocRecord.findOne({ organizationId: org._id, doctype: T, name: esc }).lean())!.stateEnteredAt as Date;
  const hours = (h: number) => new Date(entered.getTime() + h * 3_600_000);
  const escalationNotes = () => Notification.countDocuments({ organizationId: org._id, kind: 'escalation', link: `/app/records/${T}/${esc}` });
  await runEscalations(hours(23));
  assert.equal(await escalationNotes(), 0, 'not yet due');
  const ran = await runEscalations(hours(25));
  assert.ok(ran >= 1);
  assert.equal(await escalationNotes(), 3, 'owner, plus the approvers (chief accountant, owner, office manager) once each');
  assert.equal((await runEscalations(hours(26))), 0, 'once per time in a state');
  assert.equal(await escalationNotes(), 3);
  const escHist = (await view(owner, esc)).workflow.history;
  assert.equal(escHist.at(-1).action, 'escalated');
  // decided records are never escalated
  await runEscalations(hours(500));
  assert.equal((await Notification.countDocuments({ organizationId: org._id, kind: 'escalation', link: `/app/records/${T}/${r1}` })), 0);
  // entering the state again starts a new clock
  await act(chief, esc, 'return', 'again');
  await act(accountant, esc, 'submit');
  const again = (await DocRecord.findOne({ organizationId: org._id, doctype: T, name: esc }).lean())!.stateEnteredAt as Date;
  assert.ok(again > entered);
  assert.ok((await runEscalations(new Date(again.getTime() + 25 * 3_600_000))) >= 1);

  // ---- changing a workflow safely ---------------------------------------------------------------------------------------
  const removal: any = definition();
  removal.states = removal.states.filter((s: any) => s.name !== 'review');
  removal.transitions = removal.transitions.filter((t: any) => t.from !== 'review' && t.to !== 'review');
  removal.escalations = [];
  const blocked = await owner.call('PUT', W, removal);
  assert.equal(blocked.status, 422);
  assert.ok(blocked.json.errors.states.some((m: string) => /review/.test(m) && /record/.test(m)), 'cannot remove a state that holds records');

  // inactive workflow: actions are refused, editing is free
  const wasInReview = big;
  const off: any = definition(); off.active = false;
  assert.equal((await owner.call('PUT', W, off)).status, 200);
  assert.equal((await act(office, wasInReview, 'fast_approve')).status, 422);
  assert.equal((await accountant.call('PUT', `${R}/${wasInReview}`, { data: { amount: 99 } })).status, 200, 'no active workflow, no locking');
  assert.equal((await view(accountant, wasInReview)).workflow, undefined);
  assert.equal((await owner.call('PUT', W, definition())).status, 200);

  // deleting the type removes its workflow
  assert.equal((await owner.call('DELETE', `${C}/doctypes/${T}`)).status, 204);
  assert.equal(await Workflow.countDocuments({ organizationId: org._id, doctype: T }), 0);

  // ---- audit -------------------------------------------------------------------------------------------------------------------
  for (const a of ['workflow.updated', 'workflow.action']) assert.ok(await AuditEvent.exists({ organizationId: org._id, action: a }), a);
  assert.equal(await verifyChain(org._id), null, 'audit chain intact');
  void salesId; void ownerId;

  console.log('workflow-smoke: engine checks passed');
} finally {
  server.close();
  await disconnectDb();
  await mem.stop();
}
