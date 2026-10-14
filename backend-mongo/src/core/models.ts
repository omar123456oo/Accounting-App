import { Schema, model } from 'mongoose';
import { FIELD_TYPES } from './fields.js';

const org = { type: Schema.Types.ObjectId, ref: 'Organization', required: true };

const fieldShape = {
  fieldname: { type: String, required: true },
  label: { type: String, required: true },
  fieldtype: { type: String, enum: FIELD_TYPES, required: true },
  options: [String],
  required: Boolean,
  hidden: Boolean,
  insertAfter: String,
};

/** A document type an admin created. Built-in types are declared in code (builtin-doctypes.ts), not stored. */
const docType = new Schema({
  organizationId: org,
  name: { type: String, required: true },
  label: { type: String, required: true },
  module: { type: String, required: true },
  fields: [new Schema(fieldShape, { _id: false })],
  titleField: { type: String, required: true },
  searchFields: [String],
  viewPermission: { type: String, required: true },
}, { timestamps: true });
docType.index({ organizationId: 1, name: 1 }, { unique: true });

/** A field an admin added to a built-in or admin-made DocType. */
const customField = new Schema({ organizationId: org, doctype: { type: String, required: true }, ...fieldShape }, { timestamps: true });
customField.index({ organizationId: 1, doctype: 1, fieldname: 1 }, { unique: true });

/** One record of an admin-made DocType. `data` holds the values keyed by fieldname. */
const docRecord = new Schema({
  organizationId: org,
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  data: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
docRecord.index({ organizationId: 1, doctype: 1, name: 1 }, { unique: true });

export const DocType = model('DocType', docType);
export const CustomField = model('CustomField', customField);
export const DocRecord = model('DocRecord', docRecord);
