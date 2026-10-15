import { signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ClientScript, ClientScriptRuntime, Command, EmitResult, FormSnapshot, ScriptButton } from './client-script-runtime';
import { FieldDef } from './core.models';

export interface FormScriptsDeps {
  group: () => FormGroup | null;
  fields: () => readonly FieldDef[];
  canEdit: () => boolean;
  doc: () => FormSnapshot['doc'];
  user: () => FormSnapshot['user'];
}

const typeName: Record<FieldDef['fieldtype'], string> = { text: 'text', number: 'number', currency: 'number', date: 'date text', select: 'text', link: 'text', checkbox: 'true or false' };

/** A value of the type the field holds, or undefined when the script offered something else. */
function fit(field: FieldDef, value: unknown): string | number | boolean | undefined {
  switch (field.fieldtype) {
    case 'number': case 'currency': return typeof value === 'number' ? value : undefined;
    case 'checkbox': return typeof value === 'boolean' ? value : undefined;
    case 'select': return typeof value === 'string' && (value === '' || !!field.options?.includes(value)) ? value : undefined;
    case 'date': return typeof value === 'string' && (value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : undefined;
    default: return typeof value === 'string' ? value : undefined;
  }
}

/**
 * The bridge between the client-script runtime and one record form: it feeds the runtime snapshots of the form and applies
 * what comes back (values of the right type, visibility, required, read-only). It never enables a form the person may not edit.
 */
export class FormScripts {
  readonly hidden = signal<ReadonlySet<string>>(new Set());
  readonly required = signal<ReadonlySet<string>>(new Set());
  readonly readonly = signal<ReadonlySet<string>>(new Set());
  readonly buttons = signal<ScriptButton[]>([]);
  /** Load problems, shown to developers only. */
  readonly warnings = signal<string[]>([]);
  private runtime: ClientScriptRuntime | null = null;

  constructor(private readonly deps: FormScriptsDeps) {}

  async load(scripts: readonly ClientScript[], developer: boolean): Promise<void> {
    if (!scripts.length) return;
    try {
      this.runtime = await ClientScriptRuntime.create(scripts);
    } catch {
      if (developer) this.warnings.set(['The script engine could not be loaded.']);
      return;
    }
    if (developer) this.warnings.set(this.runtime.loadErrors);
    this.buttons.set(this.runtime.buttons);
    this.attachRequired();
  }

  /** Runs an event (onload, refresh, validate, before_save, change:<field>) and applies the result. */
  run(event: string): EmitResult {
    if (!this.runtime) return { commands: [], errors: [], messages: [] };
    const result = this.runtime.emit(event, this.snapshot());
    return this.finish(result);
  }

  click(buttonId: number): EmitResult {
    if (!this.runtime) return { commands: [], errors: [], messages: [] };
    return this.finish(this.runtime.click(buttonId, this.snapshot()));
  }

  dispose(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.buttons.set([]);
  }

  private snapshot(): FormSnapshot {
    const group = this.deps.group();
    return { values: group ? { ...group.getRawValue() } : {}, fields: this.deps.fields().map((f) => f.fieldname), doc: this.deps.doc(), user: this.deps.user() };
  }

  private finish(result: EmitResult): EmitResult {
    const notes = this.apply(result.commands);
    if (this.runtime?.broken) this.buttons.set([]);
    return { commands: result.commands, errors: result.errors, messages: [...result.messages, ...notes] };
  }

  /** Visibility, required and read-only are described by the whole result, so a later call can undo an earlier one. */
  private apply(commands: readonly Command[]): string[] {
    const group = this.deps.group();
    const notes: string[] = [];
    if (!group) return notes;
    const hidden = new Set(this.hidden()), required = new Set(this.required()), readonly = new Set(this.readonly());
    const touched = new Set<string>();
    for (const c of commands) {
      const def = this.deps.fields().find((f) => f.fieldname === c.field);
      const control = group.controls[c.field];
      if (!def || !control) continue;
      switch (c.t) {
        case 'hide': hidden.add(c.field); break;
        case 'show': hidden.delete(c.field); break;
        case 'required': c.on ? required.add(c.field) : required.delete(c.field); touched.add(c.field); break;
        case 'readonly': c.on ? readonly.add(c.field) : readonly.delete(c.field); touched.add(c.field); break;
        case 'set': {
          const v = fit(def, c.value);
          if (v === undefined) { notes.push(`Cannot set ${c.field}: it holds ${typeName[def.fieldtype]}.`); break; }
          control.setValue(v, { emitEvent: false });
          control.markAsDirty();
          break;
        }
      }
    }
    this.hidden.set(hidden); this.required.set(required); this.readonly.set(readonly);
    for (const name of touched) {
      const control = group.controls[name];
      control.updateValueAndValidity({ emitEvent: false });
      if (this.deps.canEdit()) { if (readonly.has(name)) control.disable({ emitEvent: false }); else control.enable({ emitEvent: false }); }
    }
    return notes;
  }

  /** A field a script marked required is invalid while it is blank. */
  private attachRequired(): void {
    const group = this.deps.group();
    if (!group) return;
    for (const [name, control] of Object.entries(group.controls)) {
      control.addValidators((c) => (this.required().has(name) && (c.value === null || c.value === undefined || (typeof c.value === 'string' && c.value.trim() === '')) ? { required: true } : null));
      control.updateValueAndValidity({ emitEvent: false });
    }
  }
}
