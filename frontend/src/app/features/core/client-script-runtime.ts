import type { QuickJSContext, QuickJSRuntime, QuickJSWASMModule } from 'quickjs-emscripten';

/**
 * Runs the client scripts of a document type for one form, inside a QuickJS virtual machine compiled to WebAssembly.
 * A script sees only the `frm` object below: no window, document, cookies, storage, network or timers, and no way to reach them.
 * Nothing crosses the boundary except JSON. Time and memory are capped; a script that exceeds them switches all scripts
 * off for the page. Scripts are a convenience: the server enforces the rules, so a stopped runtime never blocks a save.
 */
export interface ClientScript { name: string; code: string }

export interface FormSnapshot {
  values: Record<string, unknown>;
  /** Field names that exist on the form; commands for any other name are dropped. */
  fields: string[];
  doc: { name: string; isNew: boolean; state: string | null };
  user: { id: string; name: string; roles: string[]; permissions?: string[] };
}

export type Command =
  | { t: 'set'; field: string; value: string | number | boolean | null }
  | { t: 'show' | 'hide'; field: string }
  | { t: 'required' | 'readonly'; field: string; on: boolean };

export interface EmitResult { commands: Command[]; errors: string[]; messages: string[] }
export interface ScriptButton { id: number; label: string }

const EVENT_MS = 150;
const MEMORY_BYTES = 8 * 1024 * 1024;
const STACK_BYTES = 256 * 1024;
const MAX_COMMANDS = 200;
const MAX_TEXTS = 20;
const MAX_TEXT = 500;
const MAX_VALUE_TEXT = 2000;
const MAX_OUTPUT = 200_000;
interface RawCommand { t?: unknown; field?: unknown; on?: unknown; value?: unknown }
const empty = (): EmitResult => ({ commands: [], errors: [], messages: [] });

const PRELUDE = `
const __handlers = {};
const __buttons = [];
let __owner = '';
let __s = { values: {}, fields: [], doc: {}, user: {} };
let __cmds = [], __errors = [], __messages = [];
const __str = JSON.stringify;
class __Stop extends Error {}
const __EVENT = /^(onload|refresh|validate|before_save|change:[a-z][a-z0-9_]{0,63})$/;
const __known = (f) => typeof f === 'string' && __s.fields.includes(f);
const __cmd = (c) => { if (__cmds.length < ${MAX_COMMANDS}) __cmds.push(c); };
const __say = (list, t) => { if (list.length < ${MAX_TEXTS}) list.push(String(t).slice(0, ${MAX_TEXT})); };
const __field = (f) => { if (__known(f)) return true; __say(__messages, 'Unknown field "' + String(f) + '"'); return false; };
const frm = {
  on(event, fn) {
    if (typeof event !== 'string' || !__EVENT.test(event)) throw new Error('unknown event "' + String(event) + '"');
    if (typeof fn !== 'function') throw new Error('frm.on needs a function');
    (__handlers[event] = __handlers[event] || []).push({ owner: __owner, fn });
  },
  get(f) { return __s.values[f]; },
  set(f, v) { if (!__field(f)) return; __s.values[f] = v; __cmd({ t: 'set', field: f, value: v }); },
  toggle(f, show = true) { if (__field(f)) __cmd({ t: show ? 'show' : 'hide', field: f }); },
  set_required(f, on = true) { if (__field(f)) __cmd({ t: 'required', field: f, on: !!on }); },
  set_readonly(f, on = true) { if (__field(f)) __cmd({ t: 'readonly', field: f, on: !!on }); },
  msg(t) { __say(__messages, t); },
  throw(t) { __say(__errors, t); throw new __Stop(); },
  add_button(label, fn) { if (typeof fn !== 'function') throw new Error('frm.add_button needs a function'); const id = __buttons.length + 1; __buttons.push({ id, label: String(label).slice(0, 80), owner: __owner, fn }); return id; },
  get user() { return __s.user; },
  get doc() { return __s.doc; },
};
const __load = (name, fn) => { __owner = name; try { fn(); } finally { __owner = ''; } };
const __begin = (json) => { __s = JSON.parse(json); __cmds = []; __errors = []; __messages = []; };
const __run = (owner, fn, blocking) => {
  try { fn(); }
  catch (e) {
    if (e instanceof __Stop) return;
    if (e && e.name === 'InternalError') throw e; // out of memory or interrupted: not the script's to handle
    const text = owner + ': ' + String((e && e.message) || e);
    __say(blocking ? __errors : __messages, text);
  }
};
const __out = () => __str({ commands: __cmds, errors: __errors, messages: __messages });
const __emit = (event, json) => { __begin(json); const blocking = event === 'validate' || event === 'before_save'; for (const h of (__handlers[event] || [])) __run(h.owner, h.fn, blocking); return __out(); };
const __click = (id, json) => { __begin(json); const b = __buttons.find((x) => x.id === id); if (!b) __say(__messages, 'Unknown button'); else __run(b.owner, b.fn, false); return __out(); };
const __buttonList = () => __str(__buttons.map((b) => ({ id: b.id, label: b.label })));
`;

const loadModule = async (): Promise<QuickJSWASMModule> => {
  const [{ newQuickJSWASMModuleFromVariant }, variant] = await Promise.all([import('quickjs-emscripten'), import('@jitl/quickjs-singlefile-browser-release-sync')]);
  return newQuickJSWASMModuleFromVariant(variant.default);
};
let modulePromise: Promise<QuickJSWASMModule> | null = null;

export class ClientScriptRuntime {
  /** Scripts that did not parse or failed while registering their handlers, named by script. */
  readonly loadErrors: string[] = [];
  private deadline = Infinity;
  private dead = false;
  private stopped = false;

  private constructor(private readonly rt: QuickJSRuntime, private readonly vm: QuickJSContext) {}

  static async create(scripts: readonly ClientScript[]): Promise<ClientScriptRuntime> {
    const mod = await (modulePromise ??= loadModule());
    const rt = mod.newRuntime();
    rt.setMemoryLimit(MEMORY_BYTES);
    rt.setMaxStackSize(STACK_BYTES);
    const runtime = new ClientScriptRuntime(rt, rt.newContext());
    rt.setInterruptHandler(() => Date.now() > runtime.deadline);
    runtime.deadline = Date.now() + 1000;
    const boot = runtime.vm.evalCode(PRELUDE, 'prelude.js');
    if (boot.error) { boot.error.dispose(); runtime.stopped = true; runtime.loadErrors.push('The script engine could not start.'); return runtime; }
    boot.value.dispose();
    for (const s of scripts) {
      runtime.deadline = Date.now() + EVENT_MS * 2;
      const r = runtime.vm.evalCode(`__load(${JSON.stringify(s.name)}, function () {\n${s.code}\n})`, `${s.name}.js`);
      if (r.error) {
        const e = runtime.vm.dump(r.error) as { message?: string };
        r.error.dispose();
        runtime.loadErrors.push(`${s.name}: ${String(e?.message ?? 'error').slice(0, MAX_TEXT)}`);
        if (e?.message === 'interrupted' || e?.message === 'out of memory') { runtime.stopped = true; break; }
      } else r.value.dispose();
    }
    runtime.deadline = Infinity;
    return runtime;
  }

  /** True once a script ran too long or used too much memory: no script runs on this page any more. */
  get broken(): boolean { return this.stopped; }

  get buttons(): ScriptButton[] {
    if (this.dead || this.stopped) return [];
    const r = this.vm.evalCode('__buttonList()');
    if (r.error) { r.error.dispose(); return []; }
    const text = this.vm.dump(r.value) as unknown;
    r.value.dispose();
    try { return typeof text === 'string' ? (JSON.parse(text) as ScriptButton[]) : []; } catch { return []; }
  }

  /** Events: onload, refresh, validate, before_save, change:<field>. */
  emit(event: string, snapshot: FormSnapshot): EmitResult {
    return this.call(`__emit(${JSON.stringify(event)}, ${JSON.stringify(JSON.stringify(snapshot))})`, snapshot);
  }

  click(buttonId: number, snapshot: FormSnapshot): EmitResult {
    return this.call(`__click(${Number(buttonId) | 0}, ${JSON.stringify(JSON.stringify(snapshot))})`, snapshot);
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    try { this.vm.dispose(); this.rt.dispose(); } catch { /* already released */ }
  }

  private call(source: string, snapshot: FormSnapshot): EmitResult {
    if (this.dead || this.stopped) return empty();
    this.deadline = Date.now() + EVENT_MS;
    let result;
    try { result = this.vm.evalCode(source, 'emit.js'); } finally { this.deadline = Infinity; }
    if (result.error) {
      const e = this.vm.dump(result.error) as { message?: string };
      result.error.dispose();
      this.stopped = true;
      const why = e?.message === 'out of memory' ? 'used too much memory' : e?.message === 'interrupted' ? 'ran too long' : 'failed';
      return { commands: [], errors: [], messages: [`Scripts on this page were stopped: one ${why}.`] };
    }
    const text = this.vm.dump(result.value) as unknown;
    result.value.dispose();
    return this.clean(text, snapshot);
  }

  /** What the VM returned is untrusted: shape, size, field names and value types are checked again here. */
  private clean(text: unknown, snapshot: FormSnapshot): EmitResult {
    if (typeof text !== 'string' || text.length > MAX_OUTPUT) return empty();
    let raw: { commands?: unknown; errors?: unknown; messages?: unknown };
    try { raw = JSON.parse(text); } catch { return empty(); }
    const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_TEXTS).map((x) => x.slice(0, MAX_TEXT)) : []);
    const known = new Set(snapshot.fields);
    const commands: Command[] = [];
    for (const c of Array.isArray(raw.commands) ? (raw.commands as RawCommand[]) : []) {
      const field = c?.field;
      if (commands.length >= MAX_COMMANDS || typeof field !== 'string' || !known.has(field)) continue;
      switch (c.t) {
        case 'show': case 'hide': commands.push({ t: c.t, field }); break;
        case 'required': case 'readonly': commands.push({ t: c.t, field, on: c.on === true }); break;
        case 'set': {
          const v = c.value;
          const plain = v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= MAX_VALUE_TEXT);
          if (plain) commands.push({ t: 'set', field, value: v as string | number | boolean | null });
          break;
        }
      }
    }
    return { commands, errors: texts(raw.errors), messages: texts(raw.messages) };
  }
}
