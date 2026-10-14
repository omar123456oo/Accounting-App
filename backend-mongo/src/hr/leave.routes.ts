import type { Request } from 'express';
import { Router } from 'express';
import mongoose, { ClientSession, Types } from 'mongoose';
import { appendAudit } from '../db/audit-chain.js';
import { can } from '../auth/session.js';
import { Errors, HttpError, addDays, idOf, isDate, notFound, orgOf, text, todayIso, wrap } from './common.js';
import { HrSettings, LeaveBalanceHead, LeaveLedger, LeaveLock, LeaveRequest, LeaveType } from './leave.models.js';
import { Employee } from './models.js';

export const leaveRouter = Router();

// ---- messages (the server answers in the language of the request) -----------------------------------------------------
const MESSAGES = {
  en: {
    notEmployee: 'This person is not an active employee.', overlap: 'This person already has leave on some of these dates.', balance: 'Not enough leave balance for this type.',
    year: 'A leave request must stay within one calendar year; split it in two.', noDays: 'These dates contain no working days.', self: 'You cannot decide your own leave request.',
    decided: 'This item has already been decided.', transition: 'This request cannot be changed from its current status.', required: 'Required.', date: 'Use the format YYYY-MM-DD.',
    order: 'The end date cannot be before the start date.', choice: 'Unknown choice.', number: 'Enter a valid number.', noteRequired: 'A reason is required.',
  },
  ar: {
    notEmployee: 'هذا الشخص ليس موظفًا نشطًا.', overlap: 'لدى هذا الشخص إجازة في بعض هذه التواريخ.', balance: 'رصيد الإجازة غير كافٍ لهذا النوع.',
    year: 'يجب أن يكون طلب الإجازة ضمن سنة ميلادية واحدة؛ قسّمه إلى طلبين.', noDays: 'لا تحتوي هذه التواريخ على أيام عمل.', self: 'لا يمكنك البت في طلب إجازتك أنت.',
    decided: 'تم البت في هذا الطلب مسبقًا.', transition: 'لا يمكن تغيير هذا الطلب من حالته الحالية.', required: 'مطلوب.', date: 'استخدم الصيغة YYYY-MM-DD.',
    order: 'لا يمكن أن يكون تاريخ النهاية قبل البداية.', choice: 'اختيار غير معروف.', number: 'أدخل رقمًا صحيحًا.', noteRequired: 'السبب مطلوب.',
  },
} as const;
type Key = keyof (typeof MESSAGES)['en'];
const lang = (req: Request): 'en' | 'ar' => (req.get('accept-language') ?? '').toLowerCase().startsWith('en') ? 'en' : 'ar';
const m = (req: Request, key: Key): string => MESSAGES[lang(req)][key];
const bad = (req: Request, field: string, key: Key, status = 422): HttpError => new HttpError(status, m(req, key), { [field]: [m(req, key)] });

// ---- policy helpers ---------------------------------------------------------------------------------------------------
interface Policy { weekendDays: number[]; holidays: string[]; unpaidLeaveDivisor: number }
async function policyOf(org: Types.ObjectId, session?: ClientSession): Promise<Policy> {
  const s = await HrSettings.findOneAndUpdate({ organizationId: org }, { $setOnInsert: { organizationId: org } }, { upsert: true, new: true, session }).lean();
  return { weekendDays: s!.weekendDays, holidays: s!.holidays, unpaidLeaveDivisor: s!.unpaidLeaveDivisor };
}

/** Working days in [from, to]: weekend days and listed holidays do not count. */
export function workingDays(from: string, to: string, p: Pick<Policy, 'weekendDays' | 'holidays'>): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!p.weekendDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay()) && !p.holidays.includes(d)) n++;
  return n;
}

const typeDto = (t: any) => ({ id: String(t._id), nameAr: t.nameAr, nameEn: t.nameEn, entitlementDays: t.entitlementDays ?? null, paid: t.paid, active: t.active });

async function defaultTypes(org: Types.ObjectId): Promise<void> {
  if (await LeaveType.exists({ organizationId: org })) return;
  // PLACEHOLDER entitlements: the office decides its own policy; none of these is a statement of labour law.
  await LeaveType.insertMany([
    { organizationId: org, nameAr: 'إجازة سنوية', nameEn: 'Annual leave', entitlementDays: 21, paid: true },
    { organizationId: org, nameAr: 'إجازة مرضية', nameEn: 'Sick leave', entitlementDays: 15, paid: true },
    { organizationId: org, nameAr: 'إجازة طارئة', nameEn: 'Emergency leave', entitlementDays: 6, paid: true },
    { organizationId: org, nameAr: 'إجازة بدون أجر', nameEn: 'Unpaid leave', entitlementDays: null, paid: false },
  ]).catch(() => undefined);
}

// ---- who is who ---------------------------------------------------------------------------------------------------------
const has = (req: Request, p: string): boolean => req.auth!.permissions.includes(p);
const seesAll = (req: Request): boolean => has(req, 'leave.approve') || has(req, 'hr.view');

async function employeeOfUser(org: Types.ObjectId, userId: Types.ObjectId | string) {
  return Employee.findOne({ organizationId: org, userId, status: 'active' }, { firstName: 1, lastName: 1, userId: 1 }).lean();
}
const nameOf = (e: { firstName?: string; lastName?: string } | undefined | null): string => (e ? `${e.firstName} ${e.lastName}` : '');

async function view(org: Types.ObjectId, rows: any[]) {
  const emps = await Employee.find({ organizationId: org, _id: { $in: rows.map((r) => r.employeeId) } }, { firstName: 1, lastName: 1, userId: 1 }).lean();
  const byId = new Map(emps.map((e) => [String(e._id), e]));
  return rows.map((l) => {
    const e = byId.get(String(l.employeeId));
    const out: Record<string, unknown> = {
      id: String(l._id), userId: String(e?.userId ?? l.employeeId), employeeId: String(l.employeeId), userName: nameOf(e), typeId: String(l.typeId),
      from: l.from, to: l.to, days: l.days, reason: l.reason ?? '', status: l.status, createdAt: new Date(l.createdAt).toISOString(),
    };
    if (l.decidedBy) out.decidedBy = l.decidedBy;
    if (l.decidedAt) out.decidedAt = new Date(l.decidedAt).toISOString();
    if (l.note) out.note = l.note;
    return out;
  });
}

// ---- ledger -------------------------------------------------------------------------------------------------------------
type Key3 = { organizationId: Types.ObjectId; employeeId: Types.ObjectId; typeId: Types.ObjectId; year: number };

async function lock(org: Types.ObjectId, employeeId: Types.ObjectId, session: ClientSession): Promise<void> {
  await LeaveLock.updateOne({ organizationId: org, employeeId }, { $inc: { n: 1 } }, { upsert: true, session });
}

async function move(k: Key3, kind: (typeof import('./leave.models.js'))['LEDGER_KINDS'][number], days: number, session: ClientSession, extra: { requestId?: Types.ObjectId; reason?: string; actorId?: Types.ObjectId } = {}): Promise<void> {
  await LeaveLedger.create([{ ...k, kind, days, ...extra }], { session });
}

async function ensureHead(k: Key3, session: ClientSession): Promise<void> {
  await LeaveBalanceHead.updateOne(k, { $setOnInsert: { used: 0, pending: 0, adjustment: 0 } }, { upsert: true, session });
}

async function balanceOf(org: Types.ObjectId, employeeId: Types.ObjectId, type: any, year: number) {
  const h = await LeaveBalanceHead.findOne({ organizationId: org, employeeId, typeId: type._id, year }).lean();
  const entitlement = type.entitlementDays === null ? null : type.entitlementDays + (h?.adjustment ?? 0);
  const used = h?.used ?? 0;
  const pending = h?.pending ?? 0;
  return { typeId: String(type._id), year, entitlement, used, pending, remaining: entitlement === null ? null : entitlement - used - pending };
}

// ---- leave types and settings -------------------------------------------------------------------------------------------
leaveRouter.get('/leave-types', can('leave.apply'), wrap(async (req, res) => {
  await defaultTypes(orgOf(req));
  res.json({ data: (await LeaveType.find({ organizationId: orgOf(req) }).sort({ createdAt: 1 }).lean()).map(typeDto) });
}));

async function saveType(req: Request, id?: Types.ObjectId) {
  const org = orgOf(req);
  const b = req.body ?? {};
  const errors = new Errors();
  const nameAr = text(b.nameAr, 80); const nameEn = text(b.nameEn, 80);
  if (!nameAr) errors.add('nameAr', m(req, 'required'));
  if (!nameEn) errors.add('nameEn', m(req, 'required'));
  if (typeof b.paid !== 'boolean') errors.add('paid', m(req, 'required'));
  if (typeof b.active !== 'boolean') errors.add('active', m(req, 'required'));
  const days = b.entitlementDays;
  if (days !== null && days !== undefined && (!Number.isInteger(days) || days < 0 || days > 366)) errors.add('entitlementDays', m(req, 'number'));
  errors.throwIfAny();
  const data = { nameAr, nameEn, entitlementDays: days ?? null, paid: b.paid, active: b.active };
  try {
    const doc = id ? await LeaveType.findOneAndUpdate({ _id: id, organizationId: org }, { $set: data }, { new: true }).lean() : (await LeaveType.create({ ...data, organizationId: org })).toObject();
    if (!doc) throw notFound();
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.leave_type.saved', entityType: 'LeaveType', entityId: String(doc._id), after: data, ip: req.ip });
    return doc;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new HttpError(422, m(req, 'choice'), { nameEn: ['Already used.'] });
    throw e;
  }
}
leaveRouter.post('/leave-types', can('hr.manage'), wrap(async (req, res) => { res.status(201).json({ data: typeDto(await saveType(req)) }); }));
leaveRouter.put('/leave-types/:id', can('hr.manage'), wrap(async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) throw notFound();
  res.json({ data: typeDto(await saveType(req, id)) });
}));

leaveRouter.get('/settings', can('leave.apply'), wrap(async (req, res) => { res.json({ data: await policyOf(orgOf(req)) }); }));
leaveRouter.put('/settings', can('hr.manage'), wrap(async (req, res) => {
  const { weekendDays, holidays, unpaidLeaveDivisor } = req.body ?? {};
  const errors = new Errors();
  if (!Array.isArray(weekendDays) || weekendDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || weekendDays.length > 3) errors.add('weekendDays', m(req, 'choice'));
  if (!Array.isArray(holidays) || holidays.length > 60 || holidays.some((h) => !isDate(h))) errors.add('holidays', m(req, 'date'));
  if (!Number.isInteger(unpaidLeaveDivisor) || unpaidLeaveDivisor < 20 || unpaidLeaveDivisor > 31) errors.add('unpaidLeaveDivisor', m(req, 'number'));
  errors.throwIfAny();
  const data = { weekendDays: [...new Set<number>(weekendDays)].sort(), holidays: [...new Set<string>(holidays)].sort(), unpaidLeaveDivisor };
  await HrSettings.updateOne({ organizationId: orgOf(req) }, { $set: data }, { upsert: true });
  await appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action: 'hr.settings.updated', entityType: 'HrSettings', entityId: String(orgOf(req)), after: data, ip: req.ip });
  res.json({ data });
}));

// ---- balances ------------------------------------------------------------------------------------------------------------
leaveRouter.get('/leave-balances', can('leave.apply'), wrap(async (req, res) => {
  const org = orgOf(req);
  await defaultTypes(org);
  const want = typeof req.query.userId === 'string' && req.query.userId !== String(req.auth!.userId) ? idOf(req.query.userId) : req.auth!.userId;
  if (!want) throw notFound();
  if (String(want) !== String(req.auth!.userId) && !seesAll(req)) throw new HttpError(403, 'Forbidden.');
  const emp = await Employee.findOne({ organizationId: org, userId: want }, { _id: 1 }).lean();
  if (!emp) throw notFound();
  const year = Number(req.query.year) || Number(todayIso().slice(0, 4));
  const types = await LeaveType.find({ organizationId: org, active: true }).sort({ createdAt: 1 }).lean();
  res.json({ data: await Promise.all(types.map((t) => balanceOf(org, emp._id, t, year))) });
}));

/** HR corrects someone's entitlement (+/- days for a year) with a reason; the change is a ledger row and an audit event. */
leaveRouter.post('/leave-adjustments', can('hr.manage'), wrap(async (req, res) => {
  const org = orgOf(req);
  const b = req.body ?? {};
  const errors = new Errors();
  const emp = await Employee.findOne({ organizationId: org, userId: idOf(b.userId) ?? undefined, status: 'active' }, { _id: 1 }).lean();
  const type = idOf(b.typeId) && await LeaveType.findOne({ _id: idOf(b.typeId), organizationId: org }).lean();
  if (!emp) errors.add('userId', m(req, 'notEmployee'));
  if (!type) errors.add('typeId', m(req, 'choice'));
  if (!Number.isFinite(b.days) || b.days === 0 || Math.abs(b.days) > 366) errors.add('days', m(req, 'number'));
  if (!Number.isInteger(b.year) || b.year < 2000 || b.year > 2100) errors.add('year', m(req, 'number'));
  const reason = text(b.reason, 300);
  if (!reason) errors.add('reason', m(req, 'required'));
  errors.throwIfAny();
  const k: Key3 = { organizationId: org, employeeId: emp!._id, typeId: (type as any)._id, year: b.year };
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await lock(org, emp!._id, session);
      await ensureHead(k, session);
      await LeaveBalanceHead.updateOne(k, { $inc: { adjustment: b.days } }, { session });
      await move(k, 'adjust', b.days, session, { reason, actorId: req.auth!.userId });
    });
  } finally { await session.endSession(); }
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.leave.adjusted', entityType: 'Employee', entityId: String(emp!._id), after: { typeId: String(k.typeId), year: k.year, days: b.days, reason }, ip: req.ip });
  res.status(201).json({ data: await balanceOf(org, emp!._id, type, b.year) });
}));

// ---- requests ------------------------------------------------------------------------------------------------------------
leaveRouter.get('/leave', can('leave.apply'), wrap(async (req, res) => {
  const org = orgOf(req);
  const filter: Record<string, unknown> = { organizationId: org };
  if (seesAll(req)) {
    const uid = idOf(req.query.userId);
    if (uid) { const e = await Employee.findOne({ organizationId: org, userId: uid }, { _id: 1 }).lean(); filter.employeeId = e?._id ?? null; }
  } else {
    const me = await Employee.findOne({ organizationId: org, userId: req.auth!.userId }, { _id: 1 }).lean();
    filter.employeeId = me?._id ?? null;
  }
  if (typeof req.query.status === 'string' && ['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) filter.status = req.query.status;
  res.json({ data: await view(org, await LeaveRequest.find(filter).sort({ from: -1, _id: -1 }).limit(500).lean()) });
}));

leaveRouter.post('/leave', can('leave.apply'), wrap(async (req, res) => {
  const org = orgOf(req);
  const b = req.body ?? {};
  const forOther = typeof b.userId === 'string' && b.userId !== String(req.auth!.userId);
  if (forOther && !has(req, 'hr.manage')) throw new HttpError(403, 'Forbidden.');
  const target = forOther ? idOf(b.userId) : req.auth!.userId;
  const emp = target && await employeeOfUser(org, target);
  if (!emp) throw bad(req, 'userId', 'notEmployee');

  const errors = new Errors();
  const type = idOf(b.typeId) && await LeaveType.findOne({ _id: idOf(b.typeId), organizationId: org, active: true }).lean();
  if (!text(b.typeId)) errors.add('typeId', m(req, 'required')); else if (!type) errors.add('typeId', m(req, 'choice'));
  for (const f of ['from', 'to'] as const) if (!b[f]) errors.add(f, m(req, 'required')); else if (!isDate(b[f])) errors.add(f, m(req, 'date'));
  if (!errors.any) {
    if (b.to < b.from) errors.add('to', m(req, 'order'));
    else if (b.from.slice(0, 4) !== b.to.slice(0, 4)) errors.add('to', m(req, 'year'));
  }
  errors.throwIfAny();

  const year = Number(b.from.slice(0, 4));
  const k: Key3 = { organizationId: org, employeeId: emp._id, typeId: (type as any)._id, year };
  const session = await mongoose.startSession();
  try {
    const created = await session.withTransaction(async () => {
      await lock(org, emp._id, session);
      const policy = await policyOf(org, session);
      const days = workingDays(b.from, b.to, policy);
      if (days < 1) throw bad(req, 'from', 'noDays');
      if (await LeaveRequest.exists({ organizationId: org, employeeId: emp._id, status: { $in: ['pending', 'approved'] }, from: { $lte: b.to }, to: { $gte: b.from } }).session(session)) throw bad(req, 'from', 'overlap');
      await ensureHead(k, session);
      const ent = (type as any).entitlementDays as number | null;
      // Check and reserve in one atomic step, so two requests can never both take the last days.
      const reserved = await LeaveBalanceHead.updateOne(
        { ...k, ...(ent === null ? {} : { $expr: { $lte: [{ $add: ['$used', '$pending', days] }, { $add: [ent, '$adjustment'] }] } }) },
        { $inc: { pending: days } }, { session });
      if (!reserved.modifiedCount) throw bad(req, 'typeId', 'balance');
      const [doc] = await LeaveRequest.create([{ organizationId: org, employeeId: emp._id, typeId: k.typeId, from: b.from, to: b.to, days, reason: text(b.reason, 500) ?? '', createdById: req.auth!.userId }], { session });
      await move(k, 'hold', days, session, { requestId: doc._id, actorId: req.auth!.userId });
      return doc.toObject();
    });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.leave.applied', entityType: 'LeaveRequest', entityId: String(created!._id), after: { employeeId: String(emp._id), from: b.from, to: b.to, days: created!.days }, ip: req.ip });
    res.status(201).json({ data: (await view(org, [created]))[0] });
  } finally { await session.endSession(); }
}));

/** Loads a request the caller may touch (their own, or anyone's for approvers and HR); anything else is a 404. */
async function loadRequest(req: Request, session: ClientSession) {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const l = id && await LeaveRequest.findOne({ _id: id, organizationId: org }, null, { session });
  if (!l) throw notFound();
  const emp = await Employee.findOne({ organizationId: org, _id: l.employeeId }, { userId: 1, firstName: 1, lastName: 1 }, { session }).lean();
  const own = !!emp?.userId && String(emp.userId) === String(req.auth!.userId);
  if (!own && !seesAll(req)) throw notFound();
  return { l, emp, own };
}
const keyOf = (l: any): Key3 => ({ organizationId: l.organizationId, employeeId: l.employeeId, typeId: l.typeId, year: Number(l.from.slice(0, 4)) });

async function decide(req: Request, action: 'approve' | 'reject') {
  if (!has(req, 'leave.approve')) throw new HttpError(403, 'Forbidden.');
  const org = orgOf(req);
  const note = text(req.body?.note ?? req.body?.comment, 500);
  if (action === 'reject' && !note) throw bad(req, 'note', 'noteRequired');
  const session = await mongoose.startSession();
  try {
    const out = await session.withTransaction(async () => {
      const { l, emp, own } = await loadRequest(req, session);
      if (own) throw new HttpError(409, m(req, 'self'));
      await lock(org, l.employeeId, session);
      const fresh = await LeaveRequest.findById(l._id).session(session);
      if (fresh!.status !== 'pending') throw new HttpError(409, m(req, 'decided'));
      const k = keyOf(fresh);
      const type = await LeaveType.findById(fresh!.typeId).session(session).lean();
      if (action === 'approve') {
        const moved = await LeaveBalanceHead.updateOne({ ...k, pending: { $gte: fresh!.days } }, { $inc: { pending: -fresh!.days, used: fresh!.days } }, { session });
        if (!moved.modifiedCount) throw new HttpError(409, m(req, 'transition'));
        const h = await LeaveBalanceHead.findOne(k).session(session).lean();
        if (type?.entitlementDays != null && h!.used + h!.pending > type.entitlementDays + h!.adjustment) throw bad(req, 'typeId', 'balance');
        await move(k, 'hold_release', fresh!.days, session, { requestId: fresh!._id, actorId: req.auth!.userId });
        await move(k, 'use', fresh!.days, session, { requestId: fresh!._id, actorId: req.auth!.userId });
      } else {
        const moved = await LeaveBalanceHead.updateOne({ ...k, pending: { $gte: fresh!.days } }, { $inc: { pending: -fresh!.days } }, { session });
        if (!moved.modifiedCount) throw new HttpError(409, m(req, 'transition'));
        await move(k, 'hold_release', fresh!.days, session, { requestId: fresh!._id, actorId: req.auth!.userId });
      }
      Object.assign(fresh!, { status: action === 'approve' ? 'approved' : 'rejected', decidedBy: req.auth!.name, decidedById: req.auth!.userId, decidedAt: new Date(), ...(note ? { note } : {}) });
      await fresh!.save({ session });
      void emp;
      return fresh!.toObject();
    });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: `hr.leave.${action}d`, entityType: 'LeaveRequest', entityId: String(out!._id), after: { employeeId: String(out!.employeeId) }, ip: req.ip });
    return (await view(org, [out]))[0];
  } finally { await session.endSession(); }
}
leaveRouter.post('/leave/:id/approve', wrap(async (req, res) => { res.json({ data: await decide(req, 'approve') }); }));
leaveRouter.post('/leave/:id/reject', wrap(async (req, res) => { res.json({ data: await decide(req, 'reject') }); }));

/** A person withdraws their own pending request; only HR managers can undo an approved one. */
leaveRouter.post('/leave/:id/cancel', can('leave.apply'), wrap(async (req, res) => {
  const org = orgOf(req);
  const manager = has(req, 'hr.manage');
  const session = await mongoose.startSession();
  try {
    const out = await session.withTransaction(async () => {
      const { l, own } = await loadRequest(req, session);
      if (!own && !manager) throw new HttpError(403, 'Forbidden.');
      await lock(org, l.employeeId, session);
      const fresh = await LeaveRequest.findById(l._id).session(session);
      const wasApproved = fresh!.status === 'approved';
      if (fresh!.status !== 'pending' && !(wasApproved && manager)) throw new HttpError(409, m(req, 'transition'));
      const k = keyOf(fresh);
      const filter = wasApproved ? { ...k, used: { $gte: fresh!.days } } : { ...k, pending: { $gte: fresh!.days } };
      const moved = await LeaveBalanceHead.updateOne(filter, { $inc: wasApproved ? { used: -fresh!.days } : { pending: -fresh!.days } }, { session });
      if (!moved.modifiedCount) throw new HttpError(409, m(req, 'transition'));
      await move(k, wasApproved ? 'use_reverse' : 'hold_release', fresh!.days, session, { requestId: fresh!._id, actorId: req.auth!.userId });
      fresh!.status = 'cancelled';
      await fresh!.save({ session });
      return fresh!.toObject();
    });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.leave.cancelled', entityType: 'LeaveRequest', entityId: String(out!._id), ip: req.ip });
    res.json({ data: (await view(org, [out]))[0] });
  } finally { await session.endSession(); }
}));
