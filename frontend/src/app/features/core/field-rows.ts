import { FieldDef, FieldType } from './core.models';

/** A field as the editor shows it: choices are one comma-separated text box. */
export interface FieldRow {
  fieldname: string;
  label: string;
  fieldtype: FieldType;
  optionsText: string;
  required: boolean;
  hidden: boolean;
  insertAfter: string;
}

export const blankRow = (): FieldRow => ({ fieldname: '', label: '', fieldtype: 'text', optionsText: '', required: false, hidden: false, insertAfter: '' });

export const fieldsToRows = (fields: readonly FieldDef[]): FieldRow[] =>
  fields.map((f) => ({
    fieldname: f.fieldname, label: f.label, fieldtype: f.fieldtype,
    optionsText: f.fieldtype === 'select' ? (f.options ?? []).join(', ') : (f.options ?? [])[0] ?? '',
    required: !!f.required, hidden: !!f.hidden, insertAfter: f.insertAfter ?? '',
  }));

/** The request form of the rows. `withAnchors` is true for custom fields, which may name the field they follow. */
export function rowsToFields(rows: readonly FieldRow[], withAnchors: boolean): FieldDef[] {
  return rows.map((r) => {
    const options = r.fieldtype === 'select' ? r.optionsText.split(',').map((o) => o.trim()).filter(Boolean) : r.fieldtype === 'link' && r.optionsText.trim() ? [r.optionsText.trim()] : undefined;
    return {
      fieldname: r.fieldname.trim(), label: r.label.trim(), fieldtype: r.fieldtype,
      ...(options ? { options } : {}),
      ...(r.required ? { required: true } : {}),
      ...(r.hidden ? { hidden: true } : {}),
      ...(withAnchors && r.insertAfter ? { insertAfter: r.insertAfter } : {}),
    };
  });
}

/** A copy of `list` with the item at `index` moved by `delta` places; unchanged at the ends. */
export function move<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  const out = [...list];
  if (to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}
