import { Types } from 'mongoose';
import { permissionsOf } from '../auth/session.js';
import { env } from '../config/env.js';
import { Notification } from '../core/workflow.models.js';
import { Employee } from '../hr/models.js';
import { User } from '../models/index.js';
import { DATED } from './lifecycle.js';
import { escapeHtml, mailer } from './mailer.js';
import { DocDelivery, DocDocument, DocReminderJob, DocReminderRule, SmartDocType, type DocFieldDef, type FieldRole } from './models.js';
import { occurrences, type Offset } from './schedule.js';
import { audit, reevaluate, todayIn } from './service.js';

type RuleDoc = InstanceType<typeof DocReminderRule>;
type DocDoc = InstanceType<typeof DocDocument>;
type JobDoc = InstanceType<typeof DocReminderJob>;

/** Statuses in which reminders run: the data is approved and the document is still in force or lapsed. */
export const REMINDING: readonly string[] = ['approved', 'active', 'expiring_soon', 'expired', 'renewed'];
const GRACE_MS = 60 * 60_000;
const LEASE_MS = 5 * 60_000;
const backoff = (attempt: number): number => Math.min(6 * 3_600_000, 60_000 * 4 ** (attempt - 1));
const DAY = 86_400_000;

/** A rule's date field is a field key or a role name (expiry_date, end_date, renewal_date, ...). */
export function targetDateOf(doc: { values?: unknown }, fields: DocFieldDef[], dateField: string): string | undefined {
  const values = (doc.values ?? {}) as Record<string, unknown>;
  const def = fields.find((f) => f.active && (f.key === dateField || f.role === (dateField as FieldRole)) && f.type === 'date');
  const v = def ? values[def.key] : undefined;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

/** Rules that apply to a document. A rule in "override" mode replaces the wider scopes for the documents it covers. */
export async function effectiveRules(doc: DocDoc): Promise<RuleDoc[]> {
  const all = await DocReminderRule.find({ organizationId: doc.organizationId, active: true, $or: [{ scope: 'global' }, { scope: 'type', typeKey: doc.typeKey }, { scope: 'document', documentId: doc._id }] });
  const of = (s: string) => all.filter((r) => r.scope === s);
  if (of('document').some((r) => r.mode === 'override')) return of('document');
  if (of('type').some((r) => r.mode === 'override')) return [...of('type'), ...of('document')];
  return all;
}

async function summarise(doc: DocDoc): Promise<void> {
  const rows = await DocReminderJob.aggregate([{ $match: { documentId: doc._id, kind: 'reminder' } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const n = Object.fromEntries(rows.map((r) => [r._id, r.n as number]));
  const open = (n.scheduled ?? 0) + (n.processing ?? 0);
  const next = open && n.sent ? 'partially_sent' : open ? 'scheduled' : n.sent || n.failed ? 'completed' : n.cancelled ? 'cancelled' : 'none';
  if (doc.reminderStatus !== next) await DocDocument.updateOne({ _id: doc._id }, { reminderStatus: next });
}

export async function cancelReminders(doc: DocDoc | { _id: Types.ObjectId; organizationId: Types.ObjectId }, reason: string): Promise<number> {
  const r = await DocReminderJob.updateMany({ organizationId: doc.organizationId, documentId: doc._id, status: 'scheduled' }, { status: 'cancelled', reason });
  const d = await DocDocument.findById(doc._id);
  if (d) await summarise(d);
  return r.modifiedCount;
}

/**
 * Makes the stored reminder jobs match the rules and the document's current dates.
 * Safe to call any time (upload, approval, edit, renewal, rule change): jobs are keyed by document, rule, date and send time,
 * so existing ones are kept, outdated ones are cancelled and new ones are added. Sent jobs are history and are never touched.
 */
export async function rescheduleDocument(doc: DocDoc, now = new Date()): Promise<{ created: number; cancelled: number }> {
  if (doc.deletedAt || !REMINDING.includes(doc.status)) {
    const why = doc.deletedAt ? 'document deleted' : doc.status === 'archived' ? 'document archived' : doc.status === 'renewal_in_progress' ? 'renewal in progress' : 'not approved';
    return { created: 0, cancelled: await cancelReminders(doc, why) };
  }
  const type = await SmartDocType.findOne({ organizationId: doc.organizationId, key: doc.typeKey }).lean();
  const fields = (type?.fields ?? []) as DocFieldDef[];
  const desired = new Map<string, { rule: RuleDoc; targetDate: string; dueAt: Date; label: string }>();
  for (const rule of await effectiveRules(doc)) {
    const targetDate = targetDateOf(doc, fields, rule.dateField);
    if (!targetDate || !rule.offsets.length) continue;
    for (const o of occurrences({ offsets: rule.offsets as unknown as Offset[], recurring: rule.recurring ?? undefined, time: rule.time, timezone: rule.timezone }, targetDate)) {
      desired.set(`${doc._id}:${rule._id}:${targetDate}:${o.dueAt.getTime()}`, { rule, targetDate, dueAt: o.dueAt, label: `${rule.name}: ${o.label}` });
    }
  }
  let created = 0;
  for (const [key, d] of desired) {
    const late = d.dueAt.getTime() < now.getTime() - GRACE_MS;
    const r = await DocReminderJob.updateOne({ idempotencyKey: key }, { $setOnInsert: {
      organizationId: doc.organizationId, documentId: doc._id, ruleId: d.rule._id, kind: 'reminder', targetDate: d.targetDate, label: d.label, dueAt: d.dueAt,
      status: late ? 'skipped' : 'scheduled', reason: late ? 'Its send time had already passed when it was scheduled.' : undefined, idempotencyKey: key,
    } }, { upsert: true });
    if (r.upsertedCount) created++;
  }
  // A reminder cancelled earlier (the date moved away and back, or a renewal ended) is wanted again: bring it back if it is still ahead.
  if (desired.size) await DocReminderJob.updateMany({ idempotencyKey: { $in: [...desired.keys()] }, status: 'cancelled', kind: 'reminder', dueAt: { $gte: new Date(now.getTime() - GRACE_MS) } }, { $set: { status: 'scheduled', attempts: 0, lockedUntil: null }, $unset: { reason: 1, lastError: 1 } });
  const open = await DocReminderJob.find({ organizationId: doc.organizationId, documentId: doc._id, status: 'scheduled', kind: 'reminder' }, { idempotencyKey: 1 }).lean();
  const stale = open.filter((j) => !desired.has(j.idempotencyKey)).map((j) => j._id);
  let cancelled = 0;
  if (stale.length) cancelled = (await DocReminderJob.updateMany({ _id: { $in: stale } }, { status: 'cancelled', reason: 'The dates or rules changed.' })).modifiedCount;
  await summarise(doc);
  return { created, cancelled };
}

// ---- recipients and messages ---------------------------------------------------------------------------------------------

interface Person { id: string; name: string; email: string }

async function managerUserOf(org: Types.ObjectId, employee: { managerId?: Types.ObjectId | null } | null): Promise<string | null> {
  if (!employee?.managerId) return null;
  const m = await Employee.findOne({ _id: employee.managerId, organizationId: org }, { userId: 1 }).lean();
  return m?.userId ? String(m.userId) : null;
}

/** Who a rule addresses for a document: named users, role holders, the owner and managers, limited to staff who may view documents. */
export async function recipientsOf(doc: DocDoc, r: { users?: string[]; roles?: string[]; owner?: boolean; manager?: boolean }): Promise<Person[]> {
  const org = doc.organizationId;
  const ids = new Set<string>((r.users ?? []).filter((x) => /^[0-9a-f]{24}$/i.test(x)));
  if (r.owner && doc.ownerId) ids.add(String(doc.ownerId));
  if (r.manager) {
    const own = doc.ownerId ? await Employee.findOne({ organizationId: org, userId: doc.ownerId }, { managerId: 1 }).lean() : null;
    const about = doc.employeeId ? await Employee.findOne({ _id: doc.employeeId, organizationId: org }, { managerId: 1 }).lean() : null;
    for (const e of [own, about]) { const m = await managerUserOf(org, e); if (m) ids.add(m); }
  }
  const query: Record<string, unknown> = { organizationId: org, type: 'staff', $or: [{ _id: { $in: [...ids].map((i) => new Types.ObjectId(i)) } }, ...(r.roles?.length ? [{ roles: { $in: r.roles } }] : [])] };
  const users = await User.find(query).select('name email roles organizationId').lean();
  const out: Person[] = [];
  for (const u of users) if ((await permissionsOf(u)).includes('documents.view')) out.push({ id: String(u._id), name: u.name, email: u.email });
  return out;
}

const DEFAULT_SUBJECT = 'Reminder: {title}';
const DEFAULT_BODY = '{title} ({type}) — {field} is {when}.\n{label}';

export function fill(template: string, v: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => v[k] ?? '');
}

function describe(doc: DocDoc, typeLabel: string, job: JobDoc, rule: RuleDoc, tz: string, now: Date) {
  const days = Math.round((Date.parse(job.targetDate) - Date.parse(todayIn(tz, now))) / DAY);
  const when = days === 0 ? 'today' : days > 0 ? `in ${days} day${days === 1 ? '' : 's'} (${job.targetDate})` : `${-days} day${days === -1 ? '' : 's'} ago (${job.targetDate})`;
  return { title: doc.title, type: typeLabel, date: job.targetDate, days: String(days), when, field: rule.dateField.replace(/_/g, ' '), label: job.label ?? rule.name, status: doc.status.replace(/_/g, ' '), link: `${env.docs.appUrl}/app/smart-documents/${doc._id}` };
}

// ---- sending ---------------------------------------------------------------------------------------------------------------

async function deliverInApp(org: Types.ObjectId, p: Person, key: string, doc: DocDoc, title: string, body: string, jobId: Types.ObjectId): Promise<'ok' | 'failed'> {
  const k = `${key}:${p.id}:in_app`;
  if (await DocDelivery.exists({ idempotencyKey: k, status: 'submitted' })) return 'ok';
  try {
    await Notification.updateOne({ idempotencyKey: k }, { $setOnInsert: { organizationId: org, userId: new Types.ObjectId(p.id), kind: 'document_reminder', title, body, link: `/app/smart-documents/${doc._id}`, idempotencyKey: k } }, { upsert: true });
    await DocDelivery.updateOne({ idempotencyKey: k }, { $set: { organizationId: org, jobId, documentId: doc._id, userId: new Types.ObjectId(p.id), channel: 'in_app', status: 'submitted', subject: title }, $setOnInsert: { attempts: 1 } }, { upsert: true });
    return 'ok';
  } catch (e) {
    await DocDelivery.updateOne({ idempotencyKey: k }, { $set: { organizationId: org, jobId, documentId: doc._id, userId: new Types.ObjectId(p.id), channel: 'in_app', status: 'failed', error: (e as Error).message.slice(0, 300) }, $inc: { attempts: 1 } }, { upsert: true });
    return 'failed';
  }
}

async function deliverEmail(org: Types.ObjectId, p: Person, key: string, doc: DocDoc, subject: string, text: string, jobId: Types.ObjectId): Promise<'ok' | 'failed' | 'skipped'> {
  const k = `${key}:${p.id}:email`;
  if (await DocDelivery.exists({ idempotencyKey: k, status: { $in: ['submitted', 'skipped'] } })) return 'ok';
  const base = { organizationId: org, jobId, documentId: doc._id, userId: new Types.ObjectId(p.id), channel: 'email' as const, to: p.email, subject };
  const m = mailer();
  if (!m) {
    await DocDelivery.updateOne({ idempotencyKey: k }, { $set: { ...base, status: 'skipped', error: 'E-mail is not configured on this server.' }, $setOnInsert: { attempts: 1 } }, { upsert: true });
    return 'skipped';
  }
  const r = await m.send({ to: p.email, subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` });
  await DocDelivery.updateOne({ idempotencyKey: k }, { $set: { ...base, status: r.ok ? 'submitted' : 'failed', providerMessageId: r.messageId, error: r.ok ? undefined : r.error }, $inc: { attempts: 1 } }, { upsert: true });
  return r.ok ? 'ok' : 'failed';
}

async function claimJob(now: Date) {
  return DocReminderJob.findOneAndUpdate(
    { $or: [{ status: 'scheduled', dueAt: { $lte: now } }, { status: 'processing', lockedUntil: { $lt: now } }], $expr: { $lt: ['$attempts', '$maxAttempts'] } },
    { $set: { status: 'processing', lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { dueAt: 1 }, new: true });
}

const finish = (job: JobDoc, status: JobDoc['status'], extra: Record<string, unknown> = {}) =>
  DocReminderJob.updateOne({ _id: job._id }, { $set: { status, lockedUntil: null, ...extra } });

/** Sends one claimed job. Never throws: the outcome is recorded on the job. */
export async function processJob(job: JobDoc, now = new Date()): Promise<void> {
  const org = job.organizationId;
  const rule = await DocReminderRule.findOne({ _id: job.ruleId, organizationId: org });
  const doc = await DocDocument.findOne({ _id: job.documentId, organizationId: org });
  if (!rule || !doc || doc.deletedAt) return void await finish(job, 'cancelled', { reason: 'The document or rule no longer exists.' });
  if (!rule.active) return void await finish(job, 'cancelled', { reason: 'The rule is switched off.' });
  const type = await SmartDocType.findOne({ organizationId: org, key: doc.typeKey }).lean();
  const isEscalation = job.kind === 'escalation';
  if (!REMINDING.includes(doc.status)) return void await finish(job, 'cancelled', { reason: `The document is ${doc.status.replace(/_/g, ' ')}.` });
  if (targetDateOf(doc, (type?.fields ?? []) as DocFieldDef[], rule.dateField) !== job.targetDate) return void await finish(job, 'cancelled', { reason: 'The date changed.' });
  if (isEscalation) {
    const parent = job.parentJobId ? await DocReminderJob.findById(job.parentJobId) : null;
    if (!parent || parent.acknowledgedAt) return void await finish(job, 'skipped', { reason: 'The reminder was acknowledged.' });
  }

  const people = isEscalation
    ? await recipientsOf(doc, { users: rule.escalation?.users ?? [], roles: rule.escalation?.roles ?? [], manager: rule.escalation?.manager ?? false })
    : await recipientsOf(doc, { users: rule.recipients?.users ?? [], roles: rule.recipients?.roles ?? [], owner: rule.recipients?.owner ?? false, manager: rule.recipients?.manager ?? false });
  if (!people.length) return void await finish(job, 'skipped', { reason: 'No recipient can be addressed (none named, or none may view documents).' });

  const v = describe(doc, type?.label ?? doc.typeKey, job, rule, rule.timezone, now);
  const subject = (isEscalation ? 'Not acknowledged: ' : '') + fill(rule.subject || DEFAULT_SUBJECT, v);
  const body = (isEscalation ? 'This reminder was not acknowledged in time.\n' : '') + fill(rule.message || DEFAULT_BODY, v) + `\n${v.link}`;
  const results: string[] = [];
  for (const p of people) {
    if (rule.channels?.inApp !== false) results.push(await deliverInApp(org, p, job.idempotencyKey, doc, subject, body, job._id));
    if (rule.channels?.email) results.push(await deliverEmail(org, p, job.idempotencyKey, doc, subject, body, job._id));
  }
  if (results.includes('failed')) {
    const err = (await DocDelivery.findOne({ jobId: job._id, status: 'failed' }).sort({ updatedAt: -1 }).lean())?.error ?? 'A delivery failed.';
    if (job.attempts >= job.maxAttempts) await finish(job, 'failed', { lastError: err });
    else await finish(job, 'scheduled', { dueAt: new Date(now.getTime() + backoff(job.attempts)), lastError: err });
    return;
  }
  await finish(job, 'sent', { sentAt: now, lastError: null });
  await audit(org, {}, isEscalation ? 'reminder_escalated' : 'reminder_sent', doc._id, undefined, { job: String(job._id), recipients: people.length });
  const hours = rule.escalation?.afterHours;
  if (!isEscalation && hours && hours > 0) {
    await DocReminderJob.updateOne({ idempotencyKey: `${job.idempotencyKey}:esc` }, { $setOnInsert: {
      organizationId: org, documentId: doc._id, ruleId: rule._id, kind: 'escalation', targetDate: job.targetDate, label: `Escalation of ${job.label}`,
      dueAt: new Date(now.getTime() + hours * 3_600_000), status: 'scheduled', parentJobId: job._id, idempotencyKey: `${job.idempotencyKey}:esc`,
    } }, { upsert: true });
  }
  await summarise(doc);
}

export async function processDueReminders(now = new Date(), limit = 50): Promise<number> {
  let n = 0;
  for (; n < limit; n++) { const job = await claimJob(now); if (!job) break; await processJob(job, now); }
  return n;
}

/** Applies expiry rules to dated documents and moves reminders with them. */
export async function sweepStatuses(now = new Date()): Promise<number> {
  const today = todayIn(env.docs.timezone, now);
  let changed = 0;
  const cursor = DocDocument.find({ deletedAt: { $exists: false }, $or: [{ status: { $in: ['approved', 'active', 'expiring_soon', 'renewed'] } }, { status: 'expired', expiryDate: { $gte: today } }] }).cursor();
  for await (const doc of cursor) {
    if (!DATED.includes(doc.status)) continue;
    if (await reevaluate(doc, today)) { changed++; await rescheduleDocument(doc, now); }
  }
  return changed;
}

export async function acknowledge(job: JobDoc, userId: Types.ObjectId): Promise<void> {
  const parentId = job.kind === 'escalation' ? job.parentJobId : job._id;
  const now = new Date();
  await DocReminderJob.updateOne({ _id: parentId }, { acknowledgedAt: now, acknowledgedBy: userId });
  await DocReminderJob.updateMany({ parentJobId: parentId, status: 'scheduled' }, { status: 'cancelled', reason: 'Acknowledged.' });
  await audit(job.organizationId, { id: userId }, 'reminder_acknowledged', job.documentId, undefined, { job: String(parentId) });
}

/** One pass of everything that runs on a clock. */
export async function tick(now = new Date()) {
  const { processJobs } = await import('./jobs.js');
  const swept = await sweepStatuses(now);
  const reminders = await processDueReminders(now);
  const extractions = await processJobs(5, now);
  return { swept, reminders, extractions };
}
