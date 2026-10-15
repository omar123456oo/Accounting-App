// Acceptance test for server scripts: the sandbox (pure), then the script API and the hooks over HTTP.
import assert from 'node:assert/strict';
import { runInSandbox, syntaxError, type SandboxHost, type SandboxResult } from '../core/sandbox.js';

const doc = () => ({ name: 'X-1', isNew: true, state: null, data: { title: 'hello', amount: 10 } });
const user = { id: 'u1', name: 'Karim', roles: ['accountant'] };
const noDb: SandboxHost = { get: async () => null, list: async () => [] };
const run = (code: string, over: { host?: SandboxHost; ms?: number } = {}): Promise<SandboxResult> =>
  runInSandbox({ code, doc: doc(), ctx: { user, event: 'before_save', doctype: 't' }, host: over.host ?? noDb, limits: over.ms ? { ms: over.ms } : undefined });
const failed = (r: SandboxResult): Extract<SandboxResult, { ok: false }> => { assert.equal(r.ok, false, JSON.stringify(r)); return r as never; };
const passed = (r: SandboxResult): Extract<SandboxResult, { ok: true }> => { assert.equal(r.ok, true, JSON.stringify(r)); return r as never; };

// ---- the sandbox itself --------------------------------------------------------------------------------------------------------
{
  const r = passed(await run('doc.data.title = doc.data.title.toUpperCase(); set("amount", doc.data.amount * 2); msg("done"); log("a", { b: 1 });'));
  assert.deepEqual(r.doc.data, { title: 'HELLO', amount: 20 });
  assert.deepEqual(r.messages, ['done']);
  assert.deepEqual(r.logs, ['a {"b":1}']);
  assert.ok(r.durationMs >= 0);
}
assert.equal(passed(await run('const u = user; msg(u.name + ":" + u.roles.join() + ":" + ctx.event + ":" + ctx.doctype);')).messages[0], 'Karim:accountant:before_save:t');
assert.equal(failed(await run('throw_error("Amount must be positive");')).kind, 'validation');
assert.equal(failed(await run('throw_error("Amount must be positive");')).message, 'Amount must be positive');
{ const r = failed(await run('throw new Error("boom");')); assert.equal(r.kind, 'error'); assert.match(r.message, /boom/); }
{ const r = failed(await run('null.x;')); assert.equal(r.kind, 'error'); }
{ const r = failed(await run('while (true) {}', { ms: 300 })); assert.equal(r.kind, 'timeout'); assert.ok(r.durationMs < 1500, `stopped in ${r.durationMs}ms`); }
{ const r = failed(await run('const a = []; while (true) a.push(new Array(100000).fill(1));')); assert.equal(r.kind, 'memory'); }
assert.equal(failed(await run('function f() { return f() + 1 } f();')).kind, 'error', 'runaway recursion ends');
assert.equal(failed(await run('await new Promise(() => {});', { ms: 300 })).kind, 'timeout', 'a promise that never settles ends at the deadline');
{
  const r = passed(await run('msg([typeof process, typeof require, typeof fetch, typeof setTimeout, typeof module, typeof globalThis.process, typeof Buffer, typeof XMLHttpRequest].join());'));
  assert.equal(r.messages[0], 'undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined', 'nothing from the host leaks in');
}
{
  const r = passed(await run('let t; try { t = (function () {}).constructor("return typeof process")(); } catch (e) { t = "blocked"; } msg(String(t));'));
  assert.equal(r.messages[0], 'undefined', 'the Function constructor reaches only the sandbox global');
}
assert.equal(failed(await run('const x = ;')).kind, 'error', 'a syntax error is reported, not thrown to the host');
assert.equal(await syntaxError('doc.data.a = 1;'), null);
assert.match((await syntaxError('doc.data.a = ;'))!, /./);
assert.match((await syntaxError('await 1; return 2;')) ?? '', /^$/, 'await and return are allowed at the top of a script');

// logs and messages are bounded; a hostile script cannot flood the host
{
  const r = passed(await run('for (let i = 0; i < 500; i++) { log("line " + i + " " + "x".repeat(5000)); msg("m" + i); }'));
  assert.ok(r.logs.length <= 50, `${r.logs.length} log lines`);
  assert.ok(r.logs.every((l) => l.length <= 1000));
  assert.ok(r.messages.length <= 10);
}
// the document handed back is bounded and plain
assert.equal(failed(await run('doc.data.big = "x".repeat(200000);')).kind, 'error');
assert.deepEqual(passed(await run('doc.data.f = () => 1; doc.data.u = undefined; doc.data.n = null;')).doc.data, { title: 'hello', amount: 10, n: null }, 'functions and undefined do not survive');
assert.equal(failed(await run('doc.data = 5;')).kind, 'error', 'doc.data must stay an object');
assert.deepEqual(Object.keys(passed(await run('doc.name = "HACK"; doc.isNew = false; doc.state = "approved";')).doc), ['data'], 'only data is taken back');

// database access goes through the host and is capped
{
  const calls: string[] = [];
  const host: SandboxHost = { get: async (t, n) => { calls.push(`get ${t} ${n}`); return n === 'missing' ? null : { name: n, data: { v: 1 } }; }, list: async (t, o) => { calls.push(`list ${t} ${JSON.stringify(o)}`); return [{ name: 'A' }, { name: 'B' }]; } };
  const r = passed(await run('const a = await db.get("vehicle", "V-1"); const m = await db.get("vehicle", "missing"); const l = await db.list("vehicle", { q: "x", limit: 5 }); msg(JSON.stringify([a, m, l.length]));', { host }));
  assert.equal(r.messages[0], '[{"name":"V-1","data":{"v":1}},null,2]');
  assert.deepEqual(calls, ['get vehicle V-1', 'get vehicle missing', 'list vehicle {"q":"x","limit":5}']);
}
{
  const host: SandboxHost = { get: async () => { throw new Error('Not allowed'); }, list: async () => [] };
  assert.equal(passed(await run('try { await db.get("t", "n"); } catch (e) { msg("caught:" + e.message); }', { host })).messages[0], 'caught:Not allowed', 'a refused lookup is an error the script can handle');
  assert.equal(failed(await run('await db.get("t", "n");', { host })).kind, 'error', 'and fails the script when it does not');
}
{
  let n = 0;
  const host: SandboxHost = { get: async () => { n++; return null; }, list: async () => [] };
  const r = failed(await run('for (let i = 0; i < 100; i++) await db.get("t", "n" + i);', { host }));
  assert.match(r.message, /too many|limit/i);
  assert.ok(n <= 20, `${n} lookups reached the host`);
}
assert.equal(failed(await run('await db.get(5, {});')).kind, 'error', 'only strings cross into the host');
assert.equal(failed(await run('await db.list("t", { limit: "all" });')).kind, 'error');
{
  const host: SandboxHost = { get: async () => ({ blob: 'x'.repeat(500_000) }), list: async () => [] };
  assert.equal(failed(await run('await db.get("t", "n");', { host })).kind, 'error', 'a huge lookup result is refused');
}
// many sandboxes at once do not disturb each other
{
  const results = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => run(i % 2 ? `msg("ok${i}")` : 'while (true) {}', { ms: 300 })));
  assert.deepEqual(results.map((r) => r.ok), [true, false, true, false, true, false]);
  assert.equal((results[0] as { messages: string[] }).messages[0], 'ok1');
}

console.log('scripts-smoke: sandbox checks passed');

// ---- the script API and the hooks over HTTP ----------------------------------------------------------------------------------
import { MongoMemoryReplSet } from 'mongodb-memory-server';
process.env.SCRIPT_HOOK_MS = '150'; // keeps the runaway-script tests short
const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const { DocRecord } = await import('../core/models.js');
const { Script, ScriptLog } = await import('../core/script.models.js');
const { Organization, Role, User } = await import('../models/index.js');
const { hashPassword } = await import('../auth/password.js');
const { roleMatrix, PERMISSIONS } = await import('../db/permissions.js');
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

try {
  // only the owner holds developer.scripts
  assert.ok((PERMISSIONS as readonly string[]).includes('developer.scripts'));
  const matrix = roleMatrix();
  assert.deepEqual(Object.entries(matrix).filter(([, p]) => p.includes('developer.scripts')).map(([r]) => r), ['owner'], 'no other role gets script access by default');

  const owner = await Client.as('owner');
  const office = await Client.as('office_manager'); // holds nearly everything except payroll and developer.scripts
  const accountant = await Client.as('accountant');
  const tax = await Client.as('tax_specialist');
  const other = await Organization.create({ name: 'Other Office' });
  await Role.create({ organizationId: other._id, name: 'owner', permissions: roleMatrix().owner });
  await User.create({ organizationId: other._id, name: 'o', email: 'owner@other.test', passwordHash: await hashPassword(password), type: 'staff', roles: ['owner'], emailVerifiedAt: new Date() });
  const outsider = await Client.login('owner@other.test', password);

  const T = 'invoice_note';
  const mkType = (c: Client, name: string, extra: Record<string, unknown> = {}) => c.call('POST', `${C}/doctypes`, {
    name, label: name, module: 'finance', titleField: 'title', searchFields: ['title'], viewPermission: 'clients.view', managePermission: 'clients.update',
    fields: [{ fieldname: 'title', label: 'Title', fieldtype: 'text', required: true }, { fieldname: 'amount', label: 'Amount', fieldtype: 'currency' }], ...extra,
  });
  assert.equal((await mkType(owner, T)).status, 201);
  assert.equal((await mkType(owner, 'secret_note', { viewPermission: 'payroll.view' })).status, 201);
  const S = `${C}/scripts`;
  const mk = (c: Client, over: Record<string, unknown> = {}) => c.call('POST', S, { doctype: T, kind: 'server', name: 'check', event: 'before_save', code: 'msg("ok")', ...over });

  // ---- permissions -------------------------------------------------------------------------------------------------------
  assert.equal((await mk(office)).status, 403, 'even a near-admin cannot add scripts');
  assert.equal((await mk(accountant)).status, 403);
  assert.equal((await office.call('GET', S)).status, 403, 'nor read the code');
  assert.deepEqual((await outsider.call('GET', `${S}?doctype=${T}`)).json.data, [], 'another organization sees only its own scripts');

  // ---- create / validate ----------------------------------------------------------------------------------------------------
  const bad = async (over: Record<string, unknown>, field: string) => { const r = await mk(owner, over); assert.equal(r.status, 422, JSON.stringify(over)); assert.ok(r.json.errors[field], `${field} in ${JSON.stringify(r.json.errors)}`); };
  await bad({ name: 'Bad Name' }, 'name');
  await bad({ kind: 'weird' }, 'kind');
  await bad({ event: 'before_lunch' }, 'event');
  await bad({ event: undefined }, 'event');
  await bad({ code: '' }, 'code');
  await bad({ code: 'x'.repeat(20_001) }, 'code');
  await bad({ code: 'doc.data.a = ;' }, 'code');
  await bad({ order: 'first' }, 'order');
  assert.equal((await mk(owner, { doctype: 'nope' })).status, 404);
  assert.equal((await mk(owner, { doctype: 'leave_request' })).status, 404, 'built-in types have no scripts here');
  assert.equal((await mk(outsider)).status, 404, 'another organization has no such type');
  const good = await mk(owner);
  assert.equal(good.status, 201);
  assert.equal(good.json.data.version, 1);
  assert.equal((await mk(owner)).status, 422, 'names are unique per type and kind');
  for (let i = 0; i < 9; i++) assert.equal((await mk(owner, { name: `extra_${i}` })).status, 201);
  assert.equal((await mk(owner, { name: 'one_too_many' })).status, 422, 'at most ten scripts per event');
  for (let i = 0; i < 9; i++) await owner.call('DELETE', `${S}/${(await Script.findOne({ organizationId: org._id, name: `extra_${i}` }).lean())!._id}`);
  const first = good.json.data.id as string;

  // ---- read / update / delete -------------------------------------------------------------------------------------------------
  assert.equal((await owner.call('GET', `${S}/${first}`)).json.data.code, 'msg("ok")');
  assert.equal((await owner.call('GET', `${S}?doctype=${T}&kind=server`)).json.data.length, 1);
  assert.equal((await outsider.call('GET', `${S}/${first}`)).status, 404, 'a script of another organization does not exist');
  const upd = await owner.call('PUT', `${S}/${first}`, { code: 'msg("v2")' });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.data.version, 2);
  assert.equal((await owner.call('PUT', `${S}/${first}`, { description: 'only text' })).json.data.version, 2, 'version moves only when the code or event changes');
  assert.equal((await owner.call('PUT', `${S}/${first}`, { code: 'doc.data.a = ;' })).status, 422);
  assert.equal((await owner.call('GET', `${S}/${first}`)).json.data.code, 'msg("v2")', 'a refused edit changes nothing');
  assert.equal((await owner.call('PUT', `${S}/${first}`, { doctype: 'secret_note' })).json.data.doctype, T, 'the type cannot be changed');

  // ---- the test endpoint ------------------------------------------------------------------------------------------------------
  const probe = await owner.call('POST', `${S}/${first}/test`, { doc: { data: { title: 'x', amount: 5 } } });
  assert.equal(probe.status, 200);
  assert.equal(probe.json.data.ok, true);
  assert.deepEqual(probe.json.data.messages, ['v2']);
  assert.equal((await owner.call('POST', `${S}/${first}/test`, { doc: 5 })).status, 422);
  assert.equal((await accountant.call('POST', `${S}/${first}/test`, { doc: { data: {} } })).status, 403);

  // ---- hooks on records ------------------------------------------------------------------------------------------------------
  const R = `${C}/records/${T}`;
  const set = async (name: string, event: string, code: string, extra: Record<string, unknown> = {}) => {
    const r = await mk(owner, { name, event, code, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.data.id as string;
  };
  await owner.call('DELETE', `${S}/${first}`);

  // a script that refuses a save
  const neg = await set('no_negative', 'before_save', 'if (doc.data.amount < 0) throw_error("Amount cannot be negative");');
  const refused = await accountant.call('POST', R, { data: { title: 'T', amount: -5 } });
  assert.equal(refused.status, 422);
  assert.deepEqual(refused.json.errors.script, ['no_negative: Amount cannot be negative']);
  assert.equal(await DocRecord.countDocuments({ organizationId: org._id, doctype: T }), 0, 'nothing was saved');
  assert.equal((await accountant.call('POST', R, { data: { title: 'T', amount: 5 } })).status, 201);

  // a script that changes the data; the result is checked like anything else
  const upper = await set('upper', 'before_save', 'doc.data.title = doc.data.title.toUpperCase(); msg("normalised");', { order: 50 });
  const created = await accountant.call('POST', R, { data: { title: 'abc', amount: 7 } });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.data.title, 'ABC');
  assert.deepEqual(created.json.messages, ['normalised']);
  const nameAbc = created.json.data.name as string;
  assert.equal((await accountant.call('PUT', `${R}/${nameAbc}`, { data: { title: 'xyz' } })).json.data.data.title, 'XYZ', 'also on update');
  await owner.call('PUT', `${S}/${upper}`, { code: 'doc.data.amount = "not a number";' });
  const invalid = await accountant.call('POST', R, { data: { title: 'abc', amount: 1 } });
  assert.equal(invalid.status, 422, 'a script cannot sneak in data the type does not allow');
  assert.ok(invalid.json.errors['data.amount'] ?? invalid.json.errors.script);
  await owner.call('PUT', `${S}/${upper}`, { code: 'throw new Error("oops");' });
  const crashed = await accountant.call('POST', R, { data: { title: 'abc', amount: 1 } });
  assert.equal(crashed.status, 422, 'a script that crashes stops the save');
  assert.match(crashed.json.errors.script[0], /upper.*oops/);
  await owner.call('PUT', `${S}/${upper}`, { enabled: false });
  assert.equal((await accountant.call('POST', R, { data: { title: 'abc', amount: 1 } })).status, 201, 'a disabled script does not run');
  await owner.call('DELETE', `${S}/${upper}`);

  // order of execution
  await set('b_second', 'before_save', 'doc.data.title = doc.data.title + "-B";', { order: 20 });
  await set('a_first', 'before_save', 'doc.data.title = doc.data.title + "-A";', { order: 10 });
  assert.equal((await accountant.call('POST', R, { data: { title: 'o', amount: 1 } })).json.data.data.title, 'o-A-B');
  for (const n of ['b_second', 'a_first']) await owner.call('DELETE', `${S}/${(await Script.findOne({ organizationId: org._id, name: n }).lean())!._id}`);

  // who is acting
  const who = await set('who', 'before_save', 'doc.data.title = user.name + "/" + user.roles.join(",") + "/" + ctx.event + "/" + doc.isNew;');
  assert.equal((await accountant.call('POST', R, { data: { title: 'q', amount: 1 } })).json.data.data.title, 'accountant/accountant/before_save/true');
  assert.equal((await accountant.call('PUT', `${R}/${nameAbc}`, { data: { amount: 2 } })).json.data.data.title, 'accountant/accountant/before_save/false');
  await owner.call('DELETE', `${S}/${who}`);

  // database access runs as the acting user
  const rec = (await accountant.call('POST', R, { data: { title: 'seed record', amount: 1 } })).json.data.name as string;
  await DocRecord.create({ organizationId: org._id, doctype: 'secret_note', name: 'SECRET-1', data: { title: 'classified' } });
  const reader = await set('reader', 'before_save', `
    const own = await db.get("${T}", "${rec}");
    let denied = "no";
    try { await db.get("secret_note", "SECRET-1"); } catch (e) { denied = e.message; }
    const found = await db.list("${T}", { q: "seed", limit: 3 });
    const none = await db.get("${T}", "NOPE-1");
    doc.data.title = [own.data.title, denied, found.length, String(none)].join("|");`);
  const viaAccountant = await accountant.call('POST', R, { data: { title: 'x', amount: 1 } });
  assert.equal(viaAccountant.json.data.data.title, 'seed record|Not allowed to read secret_note|1|null', 'the accountant cannot read what payroll staff can');
  await owner.call('DELETE', `${S}/${reader}`);
  const reader2 = await set('reader2', 'before_save', `const s = await db.get("secret_note", "SECRET-1"); doc.data.title = s.data.title;`);
  assert.equal((await owner.call('POST', R, { data: { title: 'x', amount: 1 } })).json.data.data.title, 'classified', 'the owner can');
  await owner.call('DELETE', `${S}/${reader2}`);

  // delete and workflow-action hooks
  await set('keep', 'before_delete', 'if (doc.data.amount > 100) throw_error("Large records cannot be deleted");');
  const big = (await accountant.call('POST', R, { data: { title: 'big', amount: 500 } })).json.data.name as string;
  const small = (await accountant.call('POST', R, { data: { title: 'small', amount: 5 } })).json.data.name as string;
  const blocked = await accountant.call('DELETE', `${R}/${big}`);
  assert.equal(blocked.status, 422);
  assert.deepEqual(blocked.json.errors.script, ['keep: Large records cannot be deleted']);
  assert.equal((await accountant.call('DELETE', `${R}/${small}`)).status, 204);

  const W = `${C}/workflows/${T}`;
  assert.equal((await owner.call('PUT', W, { name: 'W', active: true, initialState: 'draft', states: [{ name: 'draft', label: 'Draft', editable: true }, { name: 'done', label: 'Done', editable: false }], transitions: [{ from: 'draft', to: 'done', action: 'finish', label: 'Finish', allowedRoles: ['accountant'], allowedUsers: [], approvals: 1, requireComment: false, preventSelfApproval: false, conditions: [] }], escalations: [] })).status, 200);
  await set('gate', 'before_action', 'if (ctx.action === "finish" && doc.data.amount > 100) throw_error("Too large to finish without a manager");');
  const afterAct = await set('note', 'after_action', 'msg("finished " + doc.name + " now " + (doc.state));');
  const rGood = (await accountant.call('POST', R, { data: { title: 'g', amount: 10 } })).json.data.name as string;
  const act = await accountant.call('POST', `${R}/${rGood}/actions`, { action: 'finish' });
  assert.equal(act.status, 200);
  assert.deepEqual(act.json.messages, [`finished ${rGood} now done`]);
  const rBig = (await accountant.call('POST', R, { data: { title: 'h', amount: 900 } })).json.data.name as string;
  const blockedAct = await accountant.call('POST', `${R}/${rBig}/actions`, { action: 'finish' });
  assert.equal(blockedAct.status, 422);
  assert.deepEqual(blockedAct.json.errors.script, ['gate: Too large to finish without a manager']);
  assert.equal((await accountant.call('GET', `${R}/${rBig}`)).json.data.workflow.state, 'draft', 'the record did not move');
  void afterAct;

  // an after-hook that fails does not undo the save
  await set('after_boom', 'after_save', 'throw new Error("late failure");');
  assert.equal((await accountant.call('POST', R, { data: { title: 'late', amount: 1 } })).status, 201, 'the record is saved even though the after-hook failed');
  assert.ok(await ScriptLog.findOne({ organizationId: org._id, name: 'after_boom', ok: false }).lean(), 'and the failure is logged');

  // ---- runaway scripts ------------------------------------------------------------------------------------------------------
  const loop = await set('forever', 'before_save', 'while (true) {}');
  const t0 = Date.now();
  const stuck = await accountant.call('POST', R, { data: { title: 'z', amount: 1 } });
  assert.equal(stuck.status, 422);
  assert.match(stuck.json.errors.script[0], /forever.*longer than/);
  assert.ok(Date.now() - t0 < 2000, `answered in ${Date.now() - t0}ms`);
  assert.equal((await accountant.call('GET', `${R}`)).status, 200, 'the server is still answering');
  await accountant.call('POST', R, { data: { title: 'z', amount: 1 } });
  await accountant.call('POST', R, { data: { title: 'z', amount: 1 } });
  const afterThree = await Script.findById(loop).lean();
  assert.equal(afterThree!.enabled, false, 'three timeouts in a row switch the script off');
  assert.equal((await accountant.call('POST', R, { data: { title: 'z', amount: 1 } })).status, 201, 'and saving works again');
  assert.ok(await AuditEvent.exists({ organizationId: org._id, action: 'script.auto_disabled' }));

  // ---- logs ------------------------------------------------------------------------------------------------------------------
  const logger = await set('logger', 'before_save', 'log("seen", doc.data.title); msg("hi");');
  await accountant.call('POST', R, { data: { title: 'logme', amount: 1 } });
  const logs = (await owner.call('GET', `${S}/${logger}/logs`)).json.data;
  assert.ok(logs.length >= 1);
  assert.deepEqual({ ok: logs[0].ok, logs: logs[0].logs, event: logs[0].event }, { ok: true, logs: ['seen logme'], event: 'before_save' });
  assert.equal((await accountant.call('GET', `${S}/${logger}/logs`)).status, 403);

  // ---- client scripts: delivered to anyone who may view the type ---------------------------------------------------------------
  const cs = await owner.call('POST', S, { doctype: T, kind: 'client', name: 'amount_rule', code: 'frm.on("refresh", () => frm.toggle("amount", true));' });
  assert.equal(cs.status, 201);
  assert.equal(cs.json.data.event, null);
  assert.equal((await owner.call('POST', S, { doctype: T, kind: 'client', name: 'bad', code: 'frm.on(' })).status, 422, 'client code is parsed on save too');
  const delivered = await tax.call('GET', `${S}/client/${T}`);
  assert.equal(delivered.status, 200);
  assert.deepEqual(delivered.json.data.map((s: any) => s.name), ['amount_rule']);
  assert.deepEqual(Object.keys(delivered.json.data[0]).sort(), ['code', 'name', 'order'], 'only what the browser needs');
  assert.equal((await tax.call('GET', `${S}/client/secret_note`)).status, 404, 'a type the person cannot view is invisible');
  assert.equal((await outsider.call('GET', `${S}/client/${T}`)).status, 404);
  await owner.call('PUT', `${S}/${cs.json.data.id}`, { enabled: false });
  assert.deepEqual((await tax.call('GET', `${S}/client/${T}`)).json.data, [], 'disabled scripts are not delivered');
  assert.equal((await owner.call('POST', `${S}/${cs.json.data.id}/test`, { doc: { data: {} } })).status, 422, 'client scripts run in the browser, not here');

  // ---- audit and clean-up ----------------------------------------------------------------------------------------------------
  const created1 = await AuditEvent.findOne({ organizationId: org._id, action: 'script.created' }).lean();
  assert.ok(created1 && JSON.stringify(created1.after).includes('code'), 'the audit trail keeps the code');
  for (const a of ['script.updated', 'script.deleted']) assert.ok(await AuditEvent.exists({ organizationId: org._id, action: a }), a);
  assert.equal(await verifyChain(org._id), null, 'audit chain intact');
  assert.equal((await owner.call('DELETE', `${C}/doctypes/${T}`)).status, 204);
  assert.equal(await Script.countDocuments({ organizationId: org._id, doctype: T }), 0, 'deleting the type removes its scripts');

  console.log('scripts-smoke: API and hook checks passed');
} finally {
  server.close();
  await disconnectDb();
  await mem.stop();
}
