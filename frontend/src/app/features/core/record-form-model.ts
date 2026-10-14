import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';
import { FieldDef, RecordData } from './core.models';

type Value = string | number | boolean | null;

export const visibleFields = (fields: readonly FieldDef[]): FieldDef[] => fields.filter((f) => !f.hidden);

const notBlank: ValidatorFn = (c) => (typeof c.value === 'string' && c.value.trim() === '' ? { required: true } : null);
const required: ValidatorFn = (c) => (c.value === null || c.value === undefined || (typeof c.value === 'string' && c.value.trim() === '') ? { required: true } : null);

const emptyOf = (f: FieldDef): Value => (f.fieldtype === 'checkbox' ? false : f.fieldtype === 'number' || f.fieldtype === 'currency' ? null : '');

/** One control per visible field, filled from the record's data. A required checkbox only needs to exist. */
export function buildGroup(fields: readonly FieldDef[], data: RecordData): FormGroup<Record<string, FormControl<Value>>> {
  const controls: Record<string, FormControl<Value>> = {};
  for (const f of visibleFields(fields)) {
    const existing = data[f.fieldname];
    const value = (existing === undefined || existing === null ? emptyOf(f) : existing) as Value;
    controls[f.fieldname] = new FormControl<Value>(value, { nonNullable: true, validators: f.required && f.fieldtype !== 'checkbox' ? [required, notBlank] : [] });
  }
  return new FormGroup(controls);
}

/** The request body: blank optional values become null (which clears them on update); hidden fields are left out. */
export function toPayload(fields: readonly FieldDef[], value: Record<string, Value>): RecordData {
  const out: RecordData = {};
  for (const f of visibleFields(fields)) {
    const v = value[f.fieldname];
    if (f.fieldtype === 'checkbox') out[f.fieldname] = v === true;
    else if (typeof v === 'string') out[f.fieldname] = v.trim() === '' ? null : v.trim();
    else out[f.fieldname] = v ?? null;
  }
  return out;
}
