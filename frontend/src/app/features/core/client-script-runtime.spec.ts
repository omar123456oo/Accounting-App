import { ClientScriptRuntime, FormSnapshot } from './client-script-runtime';

const snap = (values: Record<string, unknown> = {}, over: Partial<FormSnapshot> = {}): FormSnapshot => ({
  values: { title: 'Laptops', amount: 250, ...values },
  fields: ['title', 'amount', 'status'],
  doc: { name: 'X-1', isNew: false, state: 'draft' },
  user: { id: 'u1', name: 'Karim', roles: ['accountant'] },
  ...over,
});
const make = (...codes: string[]) => ClientScriptRuntime.create(codes.map((code, i) => ({ name: `s${i + 1}`, code })));

describe('ClientScriptRuntime', () => {
  it('runs refresh handlers and returns what they asked the form to do', async () => {
    const rt = await make('frm.on("refresh", () => { frm.toggle("status", false); frm.set_required("amount", true); frm.set_readonly("title"); frm.set("status", "open"); frm.msg("hello"); });');
    const r = rt.emit('refresh', snap());
    expect(r.commands).toEqual([
      { t: 'hide', field: 'status' }, { t: 'required', field: 'amount', on: true }, { t: 'readonly', field: 'title', on: true }, { t: 'set', field: 'status', value: 'open' },
    ]);
    expect(r.messages).toEqual(['hello']);
    expect(r.errors).toEqual([]);
    rt.dispose();
  });

  it('reads the current values, including what the script itself set a moment ago', async () => {
    const rt = await make('frm.on("refresh", () => { frm.set("amount", frm.get("amount") * 2); frm.msg(String(frm.get("amount")) + "/" + frm.get("title") + "/" + frm.user.name + "/" + frm.user.roles + "/" + frm.doc.state + "/" + frm.doc.isNew); });');
    const input = snap();
    const r = rt.emit('refresh', input);
    expect(r.messages).toEqual(['500/Laptops/Karim/accountant/draft/false']);
    expect(input.values['amount']).toBe(250); // the host's copy is untouched
    rt.dispose();
  });

  it('calls change handlers for the field that changed', async () => {
    const rt = await make('frm.on("change:amount", () => frm.msg("amount is " + frm.get("amount")));', 'frm.on("change:title", () => frm.msg("title"));');
    expect(rt.emit('change:amount', snap({ amount: 5 })).messages).toEqual(['amount is 5']);
    expect(rt.emit('change:status', snap()).messages).toEqual([]);
    rt.dispose();
  });

  it('collects validation errors from every script in order and stops a script at its first throw', async () => {
    const rt = await make('frm.on("validate", () => { if (frm.get("amount") > 100) { frm.throw("Too large"); frm.msg("not reached"); } });', 'frm.on("validate", () => frm.throw("Second"));');
    const r = rt.emit('validate', snap());
    expect(r.errors).toEqual(['Too large', 'Second']);
    expect(r.messages).toEqual([]);
    expect(rt.emit('validate', snap({ amount: 1 })).errors).toEqual(['Second']);
    rt.dispose();
  });

  it('blocks a save when a validate handler crashes, but only warns when other handlers crash', async () => {
    const rt = await make('frm.on("validate", () => { null.x; });', 'frm.on("refresh", () => { undefined(); });', 'frm.on("refresh", () => frm.msg("still runs"));');
    expect(rt.emit('validate', snap()).errors[0]).toMatch(/^s1: /);
    const r = rt.emit('refresh', snap());
    expect(r.errors).toEqual([]);
    expect(r.messages[0]).toMatch(/^s2: /);
    expect(r.messages[1]).toBe('still runs');
    rt.dispose();
  });

  it('ignores commands for fields that do not exist and says so', async () => {
    const rt = await make('frm.on("refresh", () => { frm.set("ghost", 1); frm.toggle("ghost", false); frm.msg("after"); });');
    const r = rt.emit('refresh', snap());
    expect(r.commands).toEqual([]);
    expect(r.messages.some((m) => /ghost/.test(m))).toBe(true);
    expect(r.messages).toContain('after');
    rt.dispose();
  });

  it('reports a script that does not parse and still loads the others', async () => {
    const rt = await make('frm.on("refresh", () => {', 'frm.on("refresh", () => frm.msg("ok"));');
    expect(rt.loadErrors).toHaveLength(1);
    expect(rt.loadErrors[0]).toMatch(/^s1: /);
    expect(rt.emit('refresh', snap()).messages).toEqual(['ok']);
    rt.dispose();
  });

  it('rejects unknown event names when a script registers them', async () => {
    const rt = await make('frm.on("whenever", () => {});');
    expect(rt.loadErrors[0]).toMatch(/s1.*whenever/);
    rt.dispose();
  });

  it('gives a script nothing of the page: no window, document, cookies, storage, network or process', async () => {
    const rt = await make(`frm.on("refresh", () => {
      const names = ['window', 'document', 'fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'location', 'process', 'require', 'setTimeout', 'WebSocket', 'Worker'];
      frm.msg(names.map((n) => typeof globalThis[n]).join());
      let escaped; try { escaped = (function () {}).constructor("return typeof document")(); } catch (e) { escaped = "blocked"; }
      frm.msg(String(escaped));
    });`);
    const r = rt.emit('refresh', snap());
    expect(r.messages[0]).toBe(Array(14).fill('undefined').join());
    expect(r.messages[1]).toBe('undefined');
    rt.dispose();
  });

  it('stops a runaway script, then runs no more scripts on this page', async () => {
    const rt = await make('frm.on("refresh", () => { while (true) {} });', 'frm.on("refresh", () => frm.msg("never"));');
    const t = Date.now();
    const r = rt.emit('refresh', snap());
    expect(Date.now() - t).toBeLessThan(2000);
    expect(r.messages.join(' ')).toMatch(/too long|stopped/i);
    expect(rt.broken).toBe(true);
    const again = Date.now();
    const next = rt.emit('refresh', snap());
    expect(Date.now() - again).toBeLessThan(50);
    expect(next.commands).toEqual([]);
    expect(next.errors).toEqual([]); // scripts are advisory: a broken runtime never blocks a save
    rt.dispose();
  });

  it('stops a script that eats memory', async () => {
    const rt = await make('frm.on("refresh", () => { const a = []; while (true) a.push(new Array(100000).fill(1)); });');
    const r = rt.emit('refresh', snap());
    expect(rt.broken).toBe(true);
    expect(r.messages.join(' ')).toMatch(/memory|stopped/i);
    rt.dispose();
  }, 60000); // allocation-heavy: slow when the whole suite runs at once

  it('runs buttons a script adds and lists them', async () => {
    const rt = await make('frm.add_button("Double", () => { frm.set("amount", frm.get("amount") * 2); frm.msg("doubled"); });');
    expect(rt.buttons).toEqual([{ id: 1, label: 'Double' }]);
    const r = rt.click(1, snap());
    expect(r.commands).toEqual([{ t: 'set', field: 'amount', value: 500 }]);
    expect(r.messages).toEqual(['doubled']);
    expect(rt.click(99, snap()).messages.join()).toMatch(/button/i);
    rt.dispose();
  });

  it('caps how many commands and how much text one call can return', async () => {
    const rt = await make('frm.on("refresh", () => { for (let i = 0; i < 1000; i++) { frm.set("title", "x" + i); frm.msg("m" + i); } frm.msg("y".repeat(5000)); });');
    const r = rt.emit('refresh', snap());
    expect(r.commands.length).toBeLessThanOrEqual(200);
    expect(r.messages.length).toBeLessThanOrEqual(20);
    expect(r.messages.every((m) => m.length <= 500)).toBe(true);
    rt.dispose();
  });

  it('ignores a value that is not plain data', async () => {
    const rt = await make('frm.on("refresh", () => { frm.set("title", () => 1); frm.set("amount", { a: 1 }); frm.set("status", "ok"); });');
    expect(rt.emit('refresh', snap()).commands).toEqual([{ t: 'set', field: 'status', value: 'ok' }]);
    rt.dispose();
  });

  it('can be disposed twice and refuses to run afterwards', async () => {
    const rt = await make('frm.on("refresh", () => frm.msg("x"));');
    rt.dispose();
    expect(() => rt.dispose()).not.toThrow();
    expect(rt.emit('refresh', snap()).messages).toEqual([]);
  });

  it('works with no scripts at all', async () => {
    const rt = await ClientScriptRuntime.create([]);
    expect(rt.emit('refresh', snap())).toEqual({ commands: [], errors: [], messages: [] });
    rt.dispose();
  });
});
