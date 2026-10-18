import { Router } from 'express';
import { can } from '../auth/session.js';
import { env } from '../config/env.js';
import { AuditEvent } from '../models/audit-event.js';
import { Department, Employee } from '../hr/models.js';
import { Errors, HttpError, notFound, orgOf, text, wrap } from '../hr/common.js';
import { User } from '../models/index.js';
import { DocDocument, DocReminderJob, SmartDocType, DOC_STATUSES } from './models.js';
import { ensureDefaultTypes } from './default-types.js';
import { aiState } from './extraction/ai.js';
import { ocrState } from './extraction/ocr.js';
import { has, visibleFilter } from './access.js';
import { isFieldKey, validateFieldDefs } from './fields.js';
import { mailState } from './mailer.js';
import { audit, todayIn } from './service.js';

export const configRouter = Router();
const view = can('documents.view');
const manage = can('documents.manage');

/** What is configured on this server. The screens say so plainly instead of pretending a missing service works. */
configRouter.get('/config', view, wrap(async (req, res) => {
  res.json({ data: {
    ai: aiState(), ocr: ocrState(), mail: mailState(), scheduler: { inProcess: env.docs.schedulerOn, tickSeconds: Math.round(env.docs.tickMs / 1000) },
    storage: { kind: 'local' }, limits: { maxUploadMb: env.docs.maxUploadMb, maxPages: env.docs.maxPages }, timezone: env.docs.timezone, aiRedactsSensitive: env.docs.aiRedactSensitive,
  } });
}));

// ---- document types -------------------------------------------------------------------------------------------------------
const typeDto = (t: any) => ({
  key: t.key, label: t.label, labelAr: t.labelAr ?? null, category: t.category, keywords: t.keywords ?? [], expiringSoonDays: t.expiringSoonDays, active: t.active, builtin: t.builtin,
  fields: [...(t.fields ?? [])].sort((a: any, b: any) => a.order - b.order).map((f: any) => ({ key: f.key, label: f.label, labelAr: f.labelAr ?? null, type: f.type, required: f.required, active: f.active, order: f.order, options: f.options ?? [], sensitive: f.sensitive, role: f.role ?? null, referenceKind: f.referenceKind ?? null, aiHint: f.aiHint ?? null, format: f.format ?? null })),
});

configRouter.get('/types', view, wrap(async (req, res) => {
  const org = orgOf(req);
  await ensureDefaultTypes(org);
  const all = req.query.all === 'true' && has(req, 'documents.manage');
  const rows = await SmartDocType.find({ organizationId: org, ...(all ? {} : { active: true }) }).sort({ label: 1 }).lean();
  res.json({ data: rows.map(typeDto) });
}));

configRouter.get('/types/:key', view, wrap(async (req, res) => {
  const t = await SmartDocType.findOne({ organizationId: orgOf(req), key: req.params.key }).lean();
  if (!t) throw notFound();
  res.json({ data: typeDto(t) });
}));

function typeBody(b: Record<string, any>, errors: Errors, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || 'label' in b) { const l = text(b.label, 120); if (!l) errors.add('label', 'Required.'); else out.label = l; }
  if ('labelAr' in b) out.labelAr = text(b.labelAr, 120);
  if ('category' in b) out.category = text(b.category, 40) ?? 'other';
  if ('keywords' in b) out.keywords = Array.isArray(b.keywords) ? b.keywords.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim().slice(0, 60)).slice(0, 40) : [];
  if ('expiringSoonDays' in b) { const n = Number(b.expiringSoonDays); if (!Number.isInteger(n) || n < 0 || n > 3650) errors.add('expiringSoonDays', 'Enter a whole number of days from 0 to 3650.'); else out.expiringSoonDays = n; }
  if (typeof b.active === 'boolean') out.active = b.active;
  return out;
}

configRouter.post('/types', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const b = req.body ?? {};
  const errors = new Errors();
  if (!isFieldKey(b.key)) errors.add('key', 'Use lower-case letters, digits and underscores, starting with a letter.');
  const data = typeBody(b, errors, false);
  const { fields, errors: fe } = validateFieldDefs(b.fields ?? []);
  Object.entries(fe).forEach(([k, v]) => v.forEach((m) => errors.add(k, m)));
  errors.throwIfAny();
  if (await SmartDocType.exists({ organizationId: org, key: b.key })) throw new HttpError(422, 'The given data was invalid.', { key: ['This key is already used.'] });
  const t = await SmartDocType.create({ organizationId: org, key: b.key, ...data, fields });
  await audit(org, { id: req.auth!.userId, ip: req.ip }, 'type_created', t._id, undefined, { key: t.key });
  res.status(201).json({ data: typeDto(t.toObject()) });
}));

configRouter.patch('/types/:key', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const t = await SmartDocType.findOne({ organizationId: org, key: req.params.key });
  if (!t) throw notFound();
  const errors = new Errors();
  const data = typeBody(req.body ?? {}, errors, true);
  errors.throwIfAny();
  t.set(data);
  await t.save();
  await audit(org, { id: req.auth!.userId, ip: req.ip }, 'type_updated', t._id, undefined, data);
  res.json({ data: typeDto(t.toObject()) });
}));

/**
 * Replaces a type's field list. A field that disappears from the list is kept but deactivated, so values already approved on documents
 * are never orphaned. Deactivated fields no longer appear in forms or extraction.
 */
configRouter.put('/types/:key/fields', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const t = await SmartDocType.findOne({ organizationId: org, key: req.params.key });
  if (!t) throw notFound();
  const { fields, errors } = validateFieldDefs((req.body ?? {}).fields);
  if (Object.keys(errors).length) throw new HttpError(422, 'The given data was invalid.', errors);
  const submitted = new Set(fields.map((f) => f.key));
  const kept = (t.fields as any[]).filter((f) => !submitted.has(f.key)).map((f) => ({ ...f.toObject(), active: false }));
  // A kept field's role must not collide with an active one.
  const roles = new Set(fields.filter((f) => f.active && f.role).map((f) => f.role));
  for (const k of kept) if (k.role && roles.has(k.role)) k.role = undefined;
  t.set('fields', [...fields, ...kept.map((k, i) => ({ ...k, order: fields.length + i }))]);
  await t.save();
  await audit(org, { id: req.auth!.userId, ip: req.ip }, 'type_fields_updated', t._id, undefined, { fields: fields.map((f) => f.key), deactivated: kept.map((k) => k.key) });
  res.json({ data: typeDto(t.toObject()) });
}));

// ---- pickers for forms -----------------------------------------------------------------------------------------------------
configRouter.get('/lookups', view, wrap(async (req, res) => {
  const org = orgOf(req);
  const [users, departments, employees] = await Promise.all([
    User.find({ organizationId: org, type: 'staff' }, { name: 1 }).sort({ name: 1 }).limit(500).lean(),
    Department.find({ organizationId: org, active: { $ne: false } }, { name: 1, code: 1 }).sort({ name: 1 }).limit(500).lean(),
    has(req, 'hr.employees.view') ? Employee.find({ organizationId: org }, { firstName: 1, lastName: 1, employeeNo: 1 }).limit(1000).lean() : Promise.resolve([] as any[]),
  ]);
  res.json({ data: {
    users: users.map((u) => ({ id: String(u._id), name: u.name })),
    departments: departments.map((d: any) => ({ id: String(d._id), name: d.name, code: d.code })),
    employees: employees.map((e: any) => ({ id: String(e._id), name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || String(e._id), code: e.employeeNo ?? null })),
    roles: ['owner', 'office_manager', 'chief_accountant', 'accountant', 'tax_specialist', 'auditor', 'hr_payroll', 'sales', 'read_only'],
  } });
}));

// ---- dashboard -------------------------------------------------------------------------------------------------------------
configRouter.get('/dashboard', view, wrap(async (req, res) => {
  const org = orgOf(req);
  const base = visibleFilter(req) as Record<string, any>;
  const f: Record<string, any> = { ...base };
  const typeKey = text(req.query.typeKey, 60); if (typeKey) f.typeKey = typeKey;
  for (const k of ['ownerId', 'departmentId', 'reviewerId'] as const) { const v = text(req.query[k], 24); if (v && /^[0-9a-f]{24}$/i.test(v)) f[k] = v; }
  const from = text(req.query.from, 10); const to = text(req.query.to, 10);
  if (from || to) f.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to + 'T23:59:59.999Z') } : {}) };
  const status = text(req.query.status, 30); if (status && (DOC_STATUSES as readonly string[]).includes(status)) f.status = status;
  const today = todayIn();
  const reminderDays = Math.min(365, Math.max(1, Number(req.query.reminderDays) || 30));
  const count = (extra: Record<string, unknown>) => DocDocument.countDocuments(status ? { $and: [f, extra] } : { ...f, ...extra });
  const ids = (await DocDocument.find(f, { _id: 1 }).limit(20_000).lean()).map((d) => d._id);
  const [total, review, processing, soon, expired, failed, upcoming, expiries, jobs, recent] = await Promise.all([
    DocDocument.countDocuments(f), count({ status: 'pending_review' }), count({ status: 'processing' }), count({ status: 'expiring_soon' }), count({ status: 'expired' }),
    count({ $or: [{ status: 'extraction_failed' }, { extractionStatus: 'failed' }] }),
    DocReminderJob.countDocuments({ organizationId: org, documentId: { $in: ids }, status: 'scheduled', kind: 'reminder', dueAt: { $lte: new Date(Date.now() + reminderDays * 86_400_000) } }),
    DocDocument.find({ ...f, ...(status ? {} : { status: { $in: ['approved', 'active', 'expiring_soon'] } }), expiryDate: { $gte: today } }, { title: 1, expiryDate: 1, status: 1, typeKey: 1 }).sort({ expiryDate: 1 }).limit(10).lean(),
    DocReminderJob.countDocuments({ organizationId: org, documentId: { $in: ids }, status: 'failed' }),
    AuditEvent.find({ organizationId: org, entityType: 'SmartDocument', entityId: { $in: ids.slice(0, 5000).map(String) } }).sort({ seq: -1 }).limit(15).lean(),
  ]);
  const titles = new Map((await DocDocument.find({ _id: { $in: recent.map((e) => e.entityId) } }, { title: 1 }).lean()).map((d) => [String(d._id), d.title]));
  const actors = new Map((await User.find({ _id: { $in: recent.map((e) => e.actorId).filter(Boolean) } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
  res.json({ data: {
    totals: { total, awaitingReview: review, processing, expiringSoon: soon, expired, failedExtraction: failed, upcomingReminders: upcoming, failedReminders: jobs },
    upcomingExpiries: expiries.map((d) => ({ id: String(d._id), title: d.title, expiryDate: d.expiryDate, status: d.status, typeKey: d.typeKey, daysLeft: Math.round((Date.parse(d.expiryDate!) - Date.parse(today)) / 86_400_000) })),
    recentActivity: recent.map((e) => ({ documentId: e.entityId, title: titles.get(String(e.entityId)) ?? '', action: String(e.action).replace(/^docs\./, ''), at: e.occurredAt, actor: e.actorId ? actors.get(String(e.actorId)) ?? null : null })),
    today, reminderDays,
  } });
}));

