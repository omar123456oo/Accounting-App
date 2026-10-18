import { Router } from 'express';
import { Types } from 'mongoose';
import { can } from '../auth/session.js';
import { env } from '../config/env.js';
import { Errors, HttpError, idOf, notFound, orgOf, pageOf, text, wrap } from '../hr/common.js';
import { User } from '../models/index.js';
import { DocDelivery, DocDocument, DocReminderJob, DocReminderRule, SmartDocType, UNITS, type DocFieldDef } from './models.js';
import { has, visibleFilter } from './access.js';
import { isClock, isTimezone } from './schedule.js';
import { acknowledge, effectiveRules, REMINDING, rescheduleDocument } from './reminders.service.js';
import { audit } from './service.js';

export const remindersRouter = Router();
const view = can('documents.view');
const manage = can('documents.manage');
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{24}$/i.test(x)).slice(0, 50) : []);
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[a-z_]{2,40}$/.test(x)).slice(0, 20) : []);

const ruleDto = (r: any) => ({
  id: String(r._id), scope: r.scope, typeKey: r.typeKey ?? null, documentId: r.documentId ? String(r.documentId) : null, mode: r.mode, name: r.name, description: r.description ?? null,
  dateField: r.dateField, offsets: (r.offsets ?? []).map((o: any) => ({ amount: o.amount, unit: o.unit, direction: o.direction })),
  recurring: r.recurring?.every ? { every: r.recurring.every, unit: r.recurring.unit, max: r.recurring.max ?? null } : null,
  time: r.time, timezone: r.timezone,
  recipients: { users: r.recipients?.users ?? [], roles: r.recipients?.roles ?? [], owner: !!r.recipients?.owner, manager: !!r.recipients?.manager },
  channels: { inApp: r.channels?.inApp !== false, email: !!r.channels?.email },
  escalation: r.escalation?.afterHours ? { afterHours: r.escalation.afterHours, users: r.escalation.users ?? [], roles: r.escalation.roles ?? [], manager: !!r.escalation.manager } : null,
  subject: r.subject ?? null, message: r.message ?? null, active: r.active, updatedAt: r.updatedAt,
});

async function ruleBody(req: any, b: Record<string, any>, errors: Errors, partial: boolean) {
  const org = orgOf(req);
  const out: Record<string, unknown> = {};
  if (!partial || 'name' in b) { const n = text(b.name, 120); if (!n) errors.add('name', 'Required.'); else out.name = n; }
  if ('description' in b) out.description = text(b.description, 500);
  if (!partial || 'dateField' in b) { const d = text(b.dateField, 60); if (!d || !/^[a-z][a-z0-9_]*$/.test(d)) errors.add('dateField', 'Choose the date this reminder is counted from.'); else out.dateField = d; }
  if (!partial || 'offsets' in b) {
    const list = Array.isArray(b.offsets) ? b.offsets : [];
    if (!list.length || list.length > 20) errors.add('offsets', 'Add between 1 and 20 timings.');
    const offs = list.map((o: any, i: number) => {
      if (!Number.isInteger(o?.amount) || o.amount < 0 || o.amount > 3650) errors.add(`offsets.${i}.amount`, 'Enter a whole number from 0 to 3650.');
      if (!(UNITS as readonly string[]).includes(o?.unit)) errors.add(`offsets.${i}.unit`, 'Choose minutes, hours, days, weeks or months.');
      return { amount: o?.amount, unit: o?.unit, direction: o?.direction === 'after' ? 'after' : 'before' };
    });
    out.offsets = offs;
  }
  if ('recurring' in b) {
    const r = b.recurring;
    if (!r) out.recurring = undefined;
    else if (!Number.isInteger(r.every) || r.every < 1 || r.every > 3650 || !(UNITS as readonly string[]).includes(r.unit) || (r.max !== undefined && r.max !== null && (!Number.isInteger(r.max) || r.max < 1 || r.max > 60))) errors.add('recurring', 'Repeat every a whole number of minutes, hours, days, weeks or months, at most 60 times.');
    else out.recurring = { every: r.every, unit: r.unit, max: r.max ?? undefined };
  }
  if ('time' in b) { if (!isClock(String(b.time))) errors.add('time', 'Use the 24-hour form, for example 09:00.'); else out.time = b.time; }
  if ('timezone' in b) { if (!isTimezone(String(b.timezone))) errors.add('timezone', 'Unknown time zone.'); else out.timezone = b.timezone; }
  if (!partial || 'recipients' in b) {
    const r = b.recipients ?? {};
    const rec = { users: ids(r.users), roles: names(r.roles), owner: r.owner === true, manager: r.manager === true };
    if (rec.users.length && (await User.countDocuments({ organizationId: org, type: 'staff', _id: { $in: rec.users.map((i) => new Types.ObjectId(i)) } })) !== rec.users.length) errors.add('recipients.users', 'Unknown user.');
    if (!rec.users.length && !rec.roles.length && !rec.owner && !rec.manager) errors.add('recipients', 'Choose at least one recipient.');
    out.recipients = rec;
  }
  if ('channels' in b) {
    const c = { inApp: b.channels?.inApp !== false, email: b.channels?.email === true };
    if (!c.inApp && !c.email) errors.add('channels', 'Choose at least one way to notify.');
    out.channels = c;
  }
  if ('escalation' in b) {
    const e = b.escalation;
    if (!e) out.escalation = undefined;
    else {
      const esc = { afterHours: Number(e.afterHours), users: ids(e.users), roles: names(e.roles), manager: e.manager === true };
      if (!(esc.afterHours > 0 && esc.afterHours <= 24 * 90)) errors.add('escalation.afterHours', 'Enter the hours to wait, up to 2160.');
      if (!esc.users.length && !esc.roles.length && !esc.manager) errors.add('escalation', 'Say who to escalate to.');
      out.escalation = esc;
    }
  }
  if ('subject' in b) out.subject = text(b.subject, 200);
  if ('message' in b) out.message = text(b.message, 2000);
  if (typeof b.active === 'boolean') out.active = b.active;
  if (['add', 'override'].includes(b.mode)) out.mode = b.mode;
  return out;
}

async function scopeBody(req: any, b: Record<string, any>, errors: Errors) {
  const org = orgOf(req);
  const scope = b.scope;
  if (!['global', 'type', 'document'].includes(scope)) { errors.add('scope', 'Choose global, document type or document.'); return {}; }
  if (scope === 'type') {
    const key = text(b.typeKey, 60);
    const t = key ? await SmartDocType.findOne({ organizationId: org, key }).lean() : null;
    if (!t) { errors.add('typeKey', 'Choose a document type.'); return {}; }
    const dateField = text(b.dateField, 60);
    if (dateField && !(t.fields as DocFieldDef[]).some((f) => f.type === 'date' && (f.key === dateField || f.role === dateField))) errors.add('dateField', 'This type has no such date field.');
    return { scope, typeKey: key };
  }
  if (scope === 'document') {
    const id = idOf(b.documentId);
    const d = id ? await DocDocument.findOne({ ...visibleFilter(req), _id: id }, { _id: 1 }).lean() : null;
    if (!d) { errors.add('documentId', 'Unknown document.'); return {}; }
    return { scope, documentId: d._id };
  }
  return { scope };
}

/** After a rule changes, the documents it covers get their reminder jobs rebuilt. */
async function rescheduleCovered(rule: { scope: string; typeKey?: string | null; documentId?: Types.ObjectId | null; organizationId: Types.ObjectId }): Promise<number> {
  const f: Record<string, unknown> = { organizationId: rule.organizationId, deletedAt: { $exists: false }, status: { $in: REMINDING } };
  if (rule.scope === 'type') f.typeKey = rule.typeKey;
  if (rule.scope === 'document') f._id = rule.documentId;
  let n = 0;
  for await (const d of DocDocument.find(f).limit(5000).cursor()) { await rescheduleDocument(d); n++; }
  return n;
}

remindersRouter.get('/reminder-rules', view, wrap(async (req, res) => {
  const f: Record<string, unknown> = { organizationId: orgOf(req) };
  if (['global', 'type', 'document'].includes(String(req.query.scope))) f.scope = req.query.scope;
  if (typeof req.query.typeKey === 'string') f.typeKey = req.query.typeKey;
  const docId = idOf(req.query.documentId);
  if (docId) f.documentId = docId;
  res.json({ data: (await DocReminderRule.find(f).sort({ scope: 1, name: 1 }).lean()).map(ruleDto) });
}));

/** The rules in force for one document, after override handling. */
remindersRouter.get('/documents/:id/reminder-rules', view, wrap(async (req, res) => {
  const id = idOf(req.params.id);
  const doc = id ? await DocDocument.findOne({ ...visibleFilter(req), _id: id }) : null;
  if (!doc) throw notFound();
  res.json({ data: (await effectiveRules(doc)).map((r) => ruleDto(r.toObject())) });
}));

remindersRouter.post('/reminder-rules', manage, wrap(async (req, res) => {
  const errors = new Errors();
  const b = req.body ?? {};
  const scope = await scopeBody(req, b, errors);
  const data = await ruleBody(req, { time: '09:00', timezone: env.docs.timezone, channels: { inApp: true }, ...b }, errors, false);
  errors.throwIfAny();
  const rule = await DocReminderRule.create({ organizationId: orgOf(req), ...scope, ...data, createdBy: req.auth!.userId });
  const covered = await rescheduleCovered(rule);
  await audit(orgOf(req), { id: req.auth!.userId, ip: req.ip }, 'reminder_rule_created', rule.documentId ?? rule._id, undefined, { name: rule.name, scope: rule.scope });
  res.status(201).json({ data: ruleDto(rule.toObject()), meta: { rescheduled: covered } });
}));

remindersRouter.patch('/reminder-rules/:id', manage, wrap(async (req, res) => {
  const id = idOf(req.params.id);
  const rule = id ? await DocReminderRule.findOne({ _id: id, organizationId: orgOf(req) }) : null;
  if (!rule) throw notFound();
  const errors = new Errors();
  const data = await ruleBody(req, req.body ?? {}, errors, true);
  errors.throwIfAny();
  rule.set(data);
  await rule.save();
  const covered = await rescheduleCovered(rule);
  await audit(orgOf(req), { id: req.auth!.userId, ip: req.ip }, 'reminder_rule_updated', rule.documentId ?? rule._id, undefined, { name: rule.name });
  res.json({ data: ruleDto(rule.toObject()), meta: { rescheduled: covered } });
}));

remindersRouter.delete('/reminder-rules/:id', manage, wrap(async (req, res) => {
  const id = idOf(req.params.id);
  const rule = id ? await DocReminderRule.findOne({ _id: id, organizationId: orgOf(req) }) : null;
  if (!rule) throw notFound();
  await DocReminderJob.updateMany({ ruleId: rule._id, status: 'scheduled' }, { status: 'cancelled', reason: 'The rule was deleted.' });
  await rule.deleteOne();
  await rescheduleCovered(rule);
  await audit(orgOf(req), { id: req.auth!.userId, ip: req.ip }, 'reminder_rule_deleted', rule.documentId ?? rule._id, { name: rule.name }, undefined);
  res.status(204).end();
}));

// ---- scheduled jobs --------------------------------------------------------------------------------------------------------
const jobDto = (j: any, docs: Map<string, any>) => ({
  id: String(j._id), documentId: String(j.documentId), documentTitle: docs.get(String(j.documentId))?.title ?? '', ruleId: String(j.ruleId), kind: j.kind, label: j.label ?? null, targetDate: j.targetDate,
  dueAt: j.dueAt, status: j.status, attempts: j.attempts, lastError: j.lastError ?? null, reason: j.reason ?? null, sentAt: j.sentAt ?? null, acknowledgedAt: j.acknowledgedAt ?? null,
});

remindersRouter.get('/reminders', view, wrap(async (req, res) => {
  const org = orgOf(req);
  const { page, pageSize, skip } = pageOf(req.query);
  const docFilter = visibleFilter(req);
  const visible = (await DocDocument.find(docFilter, { title: 1 }).limit(20_000).lean());
  const docs = new Map(visible.map((d) => [String(d._id), d]));
  const f: Record<string, unknown> = { organizationId: org, documentId: { $in: visible.map((d) => d._id) } };
  const status = text(req.query.status, 20);
  f.status = status && ['scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped'].includes(status) ? status : { $in: ['scheduled', 'processing'] };
  const days = Number(req.query.days);
  if (days > 0 && !status) f.dueAt = { $lte: new Date(Date.now() + days * 86_400_000) };
  const doc = idOf(req.query.documentId); if (doc) f.documentId = doc;
  const sort = f.status === 'scheduled' || (f.status as any).$in ? { dueAt: 1 as const } : { dueAt: -1 as const };
  const [rows, total] = await Promise.all([DocReminderJob.find(f).sort(sort).skip(skip).limit(pageSize).lean(), DocReminderJob.countDocuments(f)]);
  res.json({ data: rows.map((j) => jobDto(j, docs)), meta: { page, pageSize, total } });
}));

async function loadJob(req: any) {
  const id = idOf(req.params.id);
  const job = id ? await DocReminderJob.findOne({ _id: id, organizationId: orgOf(req) }) : null;
  if (!job) throw notFound();
  const doc = await DocDocument.findOne({ ...visibleFilter(req), _id: job.documentId });
  if (!doc) throw notFound();
  return job;
}

remindersRouter.post('/reminders/:id/acknowledge', view, wrap(async (req, res) => {
  const job = await loadJob(req);
  const got = await DocDelivery.exists({ jobId: job.kind === 'escalation' ? job.parentJobId : job._id, userId: req.auth!.userId });
  if (!got && !has(req, 'documents.manage')) throw new HttpError(403, 'Forbidden.');
  await acknowledge(job, req.auth!.userId);
  res.json({ data: { acknowledged: true } });
}));

/** Puts a failed or skipped reminder back in the queue (diagnose with GET /reminders?status=failed first). */
remindersRouter.post('/reminders/:id/retry', manage, wrap(async (req, res) => {
  const job = await loadJob(req);
  if (!['failed', 'skipped'].includes(job.status)) throw new HttpError(409, 'Only a failed or skipped reminder can be retried.');
  job.set({ status: 'scheduled', attempts: 0, dueAt: new Date(), lastError: null, reason: undefined, lockedUntil: null });
  await job.save();
  await audit(orgOf(req), { id: req.auth!.userId, ip: req.ip }, 'reminder_retry', job.documentId, undefined, { job: String(job._id) });
  res.json({ data: { queued: true } });
}));

// ---- notification history ---------------------------------------------------------------------------------------------------
remindersRouter.get('/notifications/history', view, wrap(async (req, res) => {
  const org = orgOf(req);
  const { page, pageSize, skip } = pageOf(req.query);
  const f: Record<string, unknown> = { organizationId: org };
  if (!has(req, 'documents.manage')) f.userId = req.auth!.userId;
  const s = text(req.query.status, 12); if (s && ['submitted', 'failed', 'skipped'].includes(s)) f.status = s;
  const c = text(req.query.channel, 10); if (c && ['in_app', 'email'].includes(c)) f.channel = c;
  const d = idOf(req.query.documentId); if (d) f.documentId = d;
  const [rows, total] = await Promise.all([DocDelivery.find(f).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(), DocDelivery.countDocuments(f)]);
  const docs = new Map((await DocDocument.find({ _id: { $in: rows.map((r) => r.documentId) } }, { title: 1 }).lean()).map((x) => [String(x._id), x.title]));
  const users = new Map((await User.find({ _id: { $in: rows.map((r) => r.userId) } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
  res.json({ data: rows.map((r: any) => ({ id: String(r._id), documentId: r.documentId ? String(r.documentId) : null, documentTitle: docs.get(String(r.documentId)) ?? '', userId: String(r.userId), userName: users.get(String(r.userId)) ?? '', channel: r.channel, status: r.status, subject: r.subject ?? null, to: r.channel === 'email' ? r.to ?? null : null, error: r.error ?? null, attempts: r.attempts, at: r.createdAt })), meta: { page, pageSize, total } });
}));
