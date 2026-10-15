import { newQuickJSWASMModule, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSDeferredPromise, type QuickJSWASMModule } from 'quickjs-emscripten';

/**
 * Runs a developer's script inside a QuickJS virtual machine compiled to WebAssembly. The script gets no `process`, `require`,
 * `fetch`, timers or file access: the only things it can reach are the objects built below. Memory, time, stack, output size
 * and the number of database lookups are all capped. There is no fallback to `eval`, `new Function` or Node's `vm`.
 */
export interface SandboxHost {
  /** One record of an admin-made type, or null. The caller decides what the acting user may read (throw to refuse). */
  get(doctype: string, name: string): Promise<unknown>;
  list(doctype: string, opts: { q?: string; limit?: number }): Promise<unknown[]>;
}
export interface SandboxLimits { ms: number; memoryBytes: number; stackBytes: number; dbCalls: number; resultChars: number; lookupChars: number }
export const DEFAULT_LIMITS: SandboxLimits = { ms: 1000, memoryBytes: 8 * 1024 * 1024, stackBytes: 256 * 1024, dbCalls: 20, resultChars: 100_000, lookupChars: 100_000 };

export interface SandboxInput {
  code: string;
  doc: { name: string; isNew: boolean; state: string | null; data: Record<string, unknown> };
  ctx: { user: { id: string; name: string; roles: string[] }; event: string; doctype: string; action?: string; comment?: string };
  host: SandboxHost;
  limits?: Partial<SandboxLimits>;
}
export type SandboxResult =
  | { ok: true; doc: { data: Record<string, unknown> }; messages: string[]; logs: string[]; durationMs: number }
  | { ok: false; kind: 'validation' | 'error' | 'timeout' | 'memory'; message: string; messages: string[]; logs: string[]; durationMs: number };

let moduleOnce: Promise<QuickJSWASMModule> | null = null;
const loadModule = (): Promise<QuickJSWASMModule> => (moduleOnce ??= newQuickJSWASMModule());

// Kept on one line so the developer's code starts on line 2 of the program.
const PRELUDE = `(async () => { const __s = JSON.parse(__input); const doc = __s.doc, ctx = __s.ctx, user = ctx.user; const __str = JSON.stringify; const __messages = [], __logs = []; const __fmt = (v) => { if (typeof v === 'string') return v; try { return __str(v) ?? String(v); } catch (e) { return String(v); } }; const throw_error = (m) => { const e = new Error(String(m)); e.__validation = true; throw e; }; const msg = (t) => { if (__messages.length < 10) __messages.push(String(t).slice(0, 500)); }; const log = (...a) => { if (__logs.length < 50) __logs.push(a.map(__fmt).join(' ').slice(0, 1000)); }; const set = (f, v) => { doc.data[f] = v; }; const db = { get: async (d, n) => { if (typeof d !== 'string' || typeof n !== 'string') throw new TypeError('db.get(doctype, name) needs two strings'); return JSON.parse(await __dbGet(d, n)); }, list: async (d, o) => { o = o || {}; if (typeof d !== 'string' || (o.q !== undefined && typeof o.q !== 'string') || (o.limit !== undefined && !Number.isInteger(o.limit))) throw new TypeError('db.list(doctype, { q?: string, limit?: integer }) got the wrong arguments'); return JSON.parse(await __dbList(d, __str({ q: o.q, limit: o.limit }))); } }; let __error = null; try { await (async () => {`;
const EPILOGUE = `})(); } catch (e) { if (e && e.name === 'InternalError') throw e; __error = { validation: !!(e && e.__validation), message: String((e && e.message) || e).slice(0, 500) }; } return __str({ data: doc.data, messages: __messages, logs: __logs, error: __error }); })()`;

const dispose = (...things: Array<{ dispose(): void; alive?: boolean } | null | undefined>): void => {
  for (const t of things) { try { if (t && t.alive !== false) t.dispose(); } catch { /* already gone */ } }
};

export async function runInSandbox(input: SandboxInput): Promise<SandboxResult> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  // The clock starts when this script starts running, not while it waits behind another one.
  const mod = await loadModule();
  const started = Date.now();
  const deadline = started + limits.ms;
  const messages: string[] = [];
  const logs: string[] = [];
  const done = (r: { ok: true; doc: { data: Record<string, unknown> } } | { ok: false; kind: 'validation' | 'error' | 'timeout' | 'memory'; message: string }): SandboxResult =>
    ({ ...r, messages, logs, durationMs: Date.now() - started }) as SandboxResult;
  const fail = (kind: 'validation' | 'error' | 'timeout' | 'memory', message: string): SandboxResult => done({ ok: false, kind, message });

  const rt = mod.newRuntime();
  rt.setMemoryLimit(limits.memoryBytes);
  rt.setMaxStackSize(limits.stackBytes);
  rt.setInterruptHandler(shouldInterruptAfterDeadline(deadline));
  const vm: QuickJSContext = rt.newContext();
  const deferreds: QuickJSDeferredPromise[] = [];
  const outstanding = new Set<Promise<void>>();
  let lookups = 0;

  /** A host function the script can call with strings; it returns a promise that settles with a JSON string or an error. */
  const bridge = (name: string, work: (args: string[]) => Promise<unknown>): void => {
    const fn = vm.newFunction(name, (...handles) => {
      const args = handles.map((h) => (vm.typeof(h) === 'string' ? vm.getString(h) : ''));
      const d = vm.newPromise();
      deferreds.push(d);
      const job = (async () => {
        try {
          if (++lookups > limits.dbCalls) throw new Error(`Too many database lookups (limit ${limits.dbCalls}).`);
          const json = JSON.stringify((await work(args)) ?? null);
          if (json.length > limits.lookupChars) throw new Error('The lookup result is too large.');
          if (vm.alive) d.resolve(vm.newString(json));
        } catch (e) {
          if (vm.alive) d.reject(vm.newError(String((e as Error)?.message ?? e).slice(0, 300)));
        }
      })();
      const tracked = job.finally(() => outstanding.delete(tracked));
      outstanding.add(tracked);
      return d.handle;
    });
    vm.setProp(vm.global, name, fn);
    fn.dispose();
  };

  let promise: ReturnType<QuickJSContext['evalCode']> | null = null;
  try {
    const input_ = vm.newString(JSON.stringify({ doc: input.doc, ctx: input.ctx }));
    vm.setProp(vm.global, '__input', input_);
    input_.dispose();
    bridge('__dbGet', async ([doctype, name]) => input.host.get(doctype, name));
    bridge('__dbList', async ([doctype, opts]) => input.host.list(doctype, JSON.parse(opts) as { q?: string; limit?: number }));

    promise = vm.evalCode(`${PRELUDE}\n${input.code}\n${EPILOGUE}`, 'script.js');
    if (promise.error) {
      const e = vm.dump(promise.error) as { message?: string; stack?: string };
      return fail('error', syntaxMessage(e));
    }
    const handle = promise.value;
    for (;;) {
      const jobs = rt.executePendingJobs();
      if (jobs.error) { const e = vm.dump(jobs.error) as { message?: string }; jobs.error.dispose(); return fail('error', String(e?.message ?? 'Script error')); }
      const state = vm.getPromiseState(handle);
      if (state.type === 'fulfilled') {
        const text = vm.dump(state.value) as unknown;
        state.value.dispose();
        return finish(text);
      }
      if (state.type === 'rejected') {
        const e = vm.dump(state.error) as { name?: string; message?: string };
        state.error.dispose();
        if (e?.message === 'out of memory') return fail('memory', 'The script used too much memory.');
        if (e?.message === 'interrupted' || Date.now() >= deadline) return fail('timeout', `The script took longer than ${limits.ms} ms.`);
        return fail('error', String(e?.message ?? 'Script error').slice(0, 500));
      }
      if (Date.now() >= deadline) return fail('timeout', `The script took longer than ${limits.ms} ms.`);
      if (!outstanding.size && !rt.hasPendingJob()) return fail('timeout', 'The script waits for something that never happens.');
      const wait = Math.max(1, Math.min(25, deadline - Date.now()));
      await Promise.race([...outstanding, new Promise<void>((r) => setTimeout(r, wait))]);
    }
  } catch (e) {
    return fail('error', `Sandbox error: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
  } finally {
    // Release everything the VM still holds; order matters (handles, then context, then runtime).
    for (const d of deferreds) dispose(d);
    if (promise && !promise.error) dispose(promise.value);
    dispose(vm, rt);
  }

  function finish(text: unknown): SandboxResult {
    if (typeof text !== 'string' || text.length > limits.resultChars) return fail('error', 'The script produced too much data.');
    let out: { data?: unknown; messages?: unknown; logs?: unknown; error?: { validation?: boolean; message?: string } | null };
    try { out = JSON.parse(text); } catch { return fail('error', 'The script returned something unreadable.'); }
    const list = (v: unknown, max: number, len: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, len)) : []);
    messages.push(...list(out.messages, 10, 500));
    logs.push(...list(out.logs, 50, 1000));
    if (out.error) return fail(out.error.validation ? 'validation' : 'error', String(out.error.message ?? 'Script error').slice(0, 500));
    if (!out.data || typeof out.data !== 'object' || Array.isArray(out.data)) return fail('error', 'doc.data must stay an object.');
    return done({ ok: true, doc: { data: out.data as Record<string, unknown> } });
  }
}

/** "SyntaxError: ... (line N)" with N counted in the developer's code (which starts on line 2 of the program). */
function syntaxMessage(e: { message?: string; stack?: string }): string {
  const line = /script\.js:(\d+)/.exec(e?.stack ?? '')?.[1];
  const n = line ? Number(line) - 1 : null;
  return `${String(e?.message ?? 'Syntax error')}${n && n > 0 ? ` (line ${n})` : ''}`.slice(0, 500);
}

/** null when the code parses; otherwise a short message. The code is not run: only the function around it is built. */
export async function syntaxError(code: string): Promise<string | null> {
  const mod = await loadModule();
  const rt = mod.newRuntime();
  rt.setMemoryLimit(DEFAULT_LIMITS.memoryBytes);
  rt.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 1000));
  const vm = rt.newContext();
  try {
    const r = vm.evalCode(`(async () => {\n${code}\n})`, 'script.js');
    if (r.error) { const e = vm.dump(r.error) as { message?: string; stack?: string }; r.error.dispose(); return syntaxMessage(e); }
    r.value.dispose();
    return null;
  } finally { dispose(vm, rt); }
}
