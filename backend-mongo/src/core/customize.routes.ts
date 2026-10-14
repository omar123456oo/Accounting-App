import type { Request } from 'express';
import { Router } from 'express';
import mongoose from 'mongoose';
import { can } from '../auth/session.js';
import { appendAudit } from '../db/audit-chain.js';
import { PERMISSIONS } from '../db/permissions.js';
import { Errors, HttpError, isDuplicateKey, notFound, orgOf, text, wrap } from '../hr/common.js';
import { BUILTIN_DOCTYPES } from './builtin-doctypes.js';
import { customFieldsOf, plainField, resolveDocType } from './doctypes.js';
import { FIELD_TYPES, isValidFieldname, type FieldDef } from './fields.js';
import { CustomField, DocCounter, DocRecord, DocType } from './models.js';
import { Workflow } from './workflow.models.js';

export const customizeRouter = Router();

const MAX_FIELDS = 100;

/** Validates a list of field definitions from a request body; problems are added to `errors` under `key`. */
function parseFields(raw: unknown, key: string, errors: Errors, reserved: string[], allowInsertAfter: boolean): FieldDef[] {
  if (!Array.isArray(raw) || raw.length > MAX_FIELDS) { errors.add(key, `Send a list of at most ${MAX_FIELDS} fields.`); return []; }
  const seen = new Set<string>(reserved);
  const out: FieldDef[] = [];
  raw.forEach((r: any, i: number) => {
    const at = `Field ${i + 1}`;
    const fieldname = r?.fieldname;
    if (!isValidFieldname(fieldname)) { errors.add(key, `${at}: fieldname must be lowercase letters, digits and underscores, starting with a letter (max 64).`); return; }
    if (seen.has(fieldname)) { errors.add(key, `${at}: "${fieldname}" is already used.`); return; }
    seen.add(fieldname);
    const label = text(r.label, 120);
    if (!label) { errors.add(key, `${at}: label is required.`); return; }
    if (!(FIELD_TYPES as readonly string[]).includes(r.fieldtype)) { errors.add(key, `${at}: unknown field type.`); return; }
    let options: string[] | undefined;
    if (r.fieldtype === 'select') {
      options = Array.isArray(r.options) ? r.options.map((o: unknown) => text(o, 120)).filter((o: string | undefined): o is string => !!o) : [];
      if (!options!.length) { errors.add(key, `${at}: a select field needs options.`); return; }
    } else if (r.fieldtype === 'link') {
      const target = Array.isArray(r.options) ? text(r.options[0], 64) : undefined;
      if (!target) { errors.add(key, `${at}: a link field needs the target DocType.`); return; }
      options = [target];
    }
    out.push({
      fieldname, label, fieldtype: r.fieldtype,
      ...(options ? { options } : {}),
      ...(r.required === true ? { required: true } : {}),
      ...(r.hidden === true ? { hidden: true } : {}),
      ...(allowInsertAfter && typeof r.insertAfter === 'string' && r.insertAfter ? { insertAfter: r.insertAfter } : {}),
    });
  });
  return out;
}

const audit = (req: Request, action: string, entityId: string, before: unknown, after: unknown) =>
  appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action, entityType: 'DocType', entityId, before, after, ip: req.ip });

customizeRouter.get('/customize/:doctype', can('admin.settings'), wrap(async (req, res) => {
  const dt = await resolveDocType(orgOf(req), String(req.params.doctype));
  if (!dt) throw notFound();
  res.json({ data: { name: dt.name, label: dt.label, fields: await customFieldsOf(orgOf(req), dt.name) } });
}));

customizeRouter.put('/customize/:doctype', can('admin.settings'), wrap(async (req, res) => {
  const org = orgOf(req);
  const dt = await resolveDocType(org, String(req.params.doctype));
  if (!dt) throw notFound();
  const errors = new Errors();
  const fields = parseFields(req.body?.fields, 'fields', errors, dt.base.map((f) => f.fieldname), true);
  errors.throwIfAny();
  const before = await customFieldsOf(org, dt.name);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await CustomField.deleteMany({ organizationId: org, doctype: dt.name }, { session });
      if (fields.length) await CustomField.insertMany(fields.map((f) => ({ ...f, organizationId: org, doctype: dt.name })), { session, ordered: true });
    });
  } finally { await session.endSession(); }
  await audit(req, 'customize.update', dt.name, before, fields);
  res.json({ data: { name: dt.name, fields } });
}));

const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);

customizeRouter.post('/doctypes', can('admin.settings'), wrap(async (req, res) => {
  const org = orgOf(req);
  const b = req.body ?? {};
  const errors = new Errors();
  if (!isValidFieldname(b.name)) errors.add('name', 'Use lowercase letters, digits and underscores, starting with a letter (max 64).');
  else if (BUILTIN_DOCTYPES[b.name]) errors.add('name', 'This name belongs to a built-in document type.');
  const label = text(b.label, 120);
  const mod = text(b.module, 64);
  if (!label) errors.add('label', 'Required.');
  if (!mod) errors.add('module', 'Required.');
  const fields = parseFields(b.fields, 'fields', errors, [], false);
  if (!fields.length && !errors.map.fields) errors.add('fields', 'Add at least one field.');
  if (!fields.some((f) => f.fieldname === b.titleField)) errors.add('titleField', 'Must be one of the fields.');
  const searchFields: string[] = Array.isArray(b.searchFields) ? b.searchFields.filter((s: unknown): s is string => typeof s === 'string') : [];
  if (searchFields.some((s) => !fields.some((f) => f.fieldname === s))) errors.add('searchFields', 'Each search field must be one of the fields.');
  if (typeof b.viewPermission !== 'string' || !KNOWN_PERMISSIONS.has(b.viewPermission)) errors.add('viewPermission', 'Unknown permission.');
  const managePermission = b.managePermission === undefined ? 'admin.settings' : b.managePermission;
  if (typeof managePermission !== 'string' || !KNOWN_PERMISSIONS.has(managePermission)) errors.add('managePermission', 'Unknown permission.');
  errors.throwIfAny();
  try {
    await DocType.create({ organizationId: org, name: b.name, label, module: mod, fields, titleField: b.titleField, searchFields, viewPermission: b.viewPermission, managePermission });
  } catch (e) {
    if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { name: ['A document type with this name already exists.'] });
    throw e;
  }
  await audit(req, 'doctype.created', b.name, null, { name: b.name, label, module: mod, fields, titleField: b.titleField, searchFields, viewPermission: b.viewPermission, managePermission });
  res.status(201).json({ data: { name: b.name, label, module: mod, isCustom: true } });
}));

customizeRouter.delete('/doctypes/:name', can('admin.settings'), wrap(async (req, res) => {
  const org = orgOf(req);
  const name = String(req.params.name);
  const existing = await DocType.findOne({ organizationId: org, name }).lean();
  if (!existing) throw notFound();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await DocType.deleteOne({ organizationId: org, name }, { session });
      await CustomField.deleteMany({ organizationId: org, doctype: name }, { session });
      await DocRecord.deleteMany({ organizationId: org, doctype: name }, { session });
      await DocCounter.deleteMany({ organizationId: org, doctype: name }, { session });
      await Workflow.deleteMany({ organizationId: org, doctype: name }, { session });
    });
  } finally { await session.endSession(); }
  await audit(req, 'doctype.deleted', name, { name, label: existing.label, fields: existing.fields.map(plainField) }, null);
  res.status(204).end();
}));
