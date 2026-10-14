export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'link', 'checkbox', 'currency'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  fieldname: string;
  label: string;
  fieldtype: FieldType;
  /** Choices for a select field; the DocType name for a link field. */
  options?: string[];
  required?: boolean;
  hidden?: boolean;
  /** Custom fields only: place this field right after the named one. */
  insertAfter?: string;
}

/** Field names become Mongo paths, so they stay lowercase letters, digits and underscores, starting with a letter. */
export const FIELDNAME = /^[a-z][a-z0-9_]{0,63}$/;
export const isValidFieldname = (name: unknown): name is string => typeof name === 'string' && FIELDNAME.test(name);

/** Built-in fields followed by custom ones, each custom field placed after its anchor (or at the end when the anchor is unknown). */
export function mergeFields(builtin: FieldDef[], custom: FieldDef[]): FieldDef[] {
  const taken = new Set(builtin.map((b) => b.fieldname));
  for (const c of custom) {
    if (taken.has(c.fieldname)) throw new Error(`duplicate fieldname: ${c.fieldname}`);
    taken.add(c.fieldname);
  }
  const out = [...builtin];
  for (const c of custom) {
    const at = c.insertAfter ? out.findIndex((x) => x.fieldname === c.insertAfter) : -1;
    if (at === -1) out.push(c);
    else out.splice(at + 1, 0, c);
  }
  return out;
}
