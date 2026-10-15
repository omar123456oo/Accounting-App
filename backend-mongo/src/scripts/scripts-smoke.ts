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
