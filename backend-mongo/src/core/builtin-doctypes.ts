import type { FieldDef } from './fields.js';

export interface BuiltinDocType {
  name: string;
  label: string;
  module: string;
  fields: FieldDef[];
  viewPermission: string;
}

/** Document types the application ships with. Customize adds fields to them; it never edits these. */
export const BUILTIN_DOCTYPES: Record<string, BuiltinDocType> = {
  leave_request: {
    name: 'leave_request',
    label: 'Leave Request',
    module: 'hr',
    viewPermission: 'leave.apply',
    fields: [
      { fieldname: 'leave_type', label: 'Leave type', fieldtype: 'select', required: true },
      { fieldname: 'from_date', label: 'From', fieldtype: 'date', required: true },
      { fieldname: 'to_date', label: 'To', fieldtype: 'date', required: true },
      { fieldname: 'reason', label: 'Reason', fieldtype: 'text' },
    ],
  },
};
