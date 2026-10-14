import type { Types } from 'mongoose';
import { BUILTIN_DOCTYPES } from './builtin-doctypes.js';
import { mergeFields, type FieldDef } from './fields.js';
import { CustomField, DocType } from './models.js';

export interface ResolvedDocType {
  name: string;
  label: string;
  module: string;
  viewPermission: string;
  /** Admin-made types only. */
  managePermission?: string;
  isCustom: boolean;
  /** Own fields only: built-in fields, or the fields of an admin-made type. Custom fields are not included. */
  base: FieldDef[];
  titleField?: string;
  searchFields: string[];
}

const plain = (f: any): FieldDef => ({
  fieldname: f.fieldname, label: f.label, fieldtype: f.fieldtype,
  ...(f.options?.length ? { options: [...f.options] } : {}),
  ...(f.required ? { required: true } : {}), ...(f.hidden ? { hidden: true } : {}),
  ...(f.insertAfter ? { insertAfter: f.insertAfter } : {}),
});

/** A built-in or this organization's own DocType, or null. Another organization's types are invisible. */
export async function resolveDocType(org: Types.ObjectId, name: string): Promise<ResolvedDocType | null> {
  const b = BUILTIN_DOCTYPES[name];
  if (b) return { name: b.name, label: b.label, module: b.module, viewPermission: b.viewPermission, isCustom: false, base: b.fields, searchFields: [] };
  const d = await DocType.findOne({ organizationId: org, name }).lean();
  if (!d) return null;
  return { name: d.name, label: d.label, module: d.module, viewPermission: d.viewPermission, managePermission: d.managePermission, isCustom: true, base: d.fields.map(plain), titleField: d.titleField, searchFields: d.searchFields };
}

export async function customFieldsOf(org: Types.ObjectId, doctype: string): Promise<FieldDef[]> {
  const rows = await CustomField.find({ organizationId: org, doctype }).sort({ _id: 1 }).lean();
  return rows.map(plain);
}

export async function mergedFields(org: Types.ObjectId, dt: ResolvedDocType): Promise<FieldDef[]> {
  return mergeFields(dt.base, await customFieldsOf(org, dt.name));
}

export { plain as plainField };
