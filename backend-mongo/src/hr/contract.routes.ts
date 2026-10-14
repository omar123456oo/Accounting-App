import { Router } from 'express';
import mongoose from 'mongoose';
import { appendAudit } from '../db/audit-chain.js';
import { can } from '../auth/session.js';
import { Errors, HttpError, addDays, idOf, isDate, notFound, orgOf, pageOf, text, todayIso, wrap } from './common.js';
import { CONTRACT_STATUSES, Contract, Employee } from './models.js';
import { canMoveContract, overlaps, renewalStart } from './rules.js';
import { accessOf, isSelf } from './scope.js';

export const contractRouter = Router();
const view = can('hr.contracts.view');
const manage = can('hr.contracts.manage');

const dto = (c: any) => ({
  id: String(c._id), employeeId: String(c.employeeId), number: c.number, version: c.version, type: c.type, status: c.status,
  startDate: c.startDate, endDate: c.endDate ?? null, probationMonths: c.probationMonths ?? null, renewalTerms: c.renewalTerms ?? null,
  alertDays: c.alertDays, previousContractId: c.previousContractId ? String(c.previousContractId) : null,
  attachments: c.attachments ?? [], amendments: c.amendments ?? [], termination: c.termination ?? null,
  daysToEnd: c.endDate ? Math.round((Date.parse(c.endDate) - Date.parse(todayIso())) / 86_400_000) : null,
});

function checkTerms(body: Record<string, any>, partial: boolean, errors: Errors) {
  const out: Record<string, unknown> = {};
  if (!partial || 'type' in body) { const t = text(body.type, 40); if (!t) errors.add('type', 'Required.'); else out.type = t; }
  if (!partial || 'startDate' in body) { if (!isDate(body.startDate)) errors.add('startDate', 'Use the format YYYY-MM-DD.'); else out.startDate = body.startDate; }
  if ('endDate' in body) {
    if (body.endDate === null || body.endDate === '') out.endDate = null;
    else if (!isDate(body.endDate)) errors.add('endDate', 'Use the format YYYY-MM-DD.'); else out.endDate = body.endDate;
  }
  if ('probationMonths' in body && body.probationMonths !== null) {
    const n = Number(body.probationMonths);
    if (!Number.isInteger(n) || n < 0 || n > 12) errors.add('probationMonths', 'Enter 0 to 12 months.'); else out.probationMonths = n;
  }
  if ('alertDays' in body) {
    const n = Number(body.alertDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) errors.add('alertDays', 'Enter 1 to 365 days.'); else out.alertDays = n;
  }
  if ('renewalTerms' in body) out.renewalTerms = text(body.renewalTerms, 1000);
  if (Array.isArray(body.attachments)) out.attachments = body.attachments.slice(0, 20).map((a: any) => ({ name: text(a?.name, 120), documentId: text(a?.documentId, 64) })).filter((a: any) => a.name);
  return out;
}

contractRouter.get('/contracts', view, wrap(async (req, res) => {
  const filter: Record<string, any> = { organizationId: orgOf(req) };
  const emp = idOf(req.query.employeeId);
  if (emp) filter.employeeId = emp;
  if ((CONTRACT_STATUSES as readonly string[]).includes(String(req.query.status))) filter.status = req.query.status;
  const days = Number(req.query.expiringInDays);
  if (Number.isFinite(days) && days > 0) { filter.status = 'active'; filter.endDate = { $gte: todayIso(), $lte: addDays(todayIso(), Math.min(days, 365)) }; }
  const { page, pageSize, skip } = pageOf(req.query);
  const [rows, total] = await Promise.all([Contract.find(filter).sort({ endDate: 1, startDate: -1 }).skip(skip).limit(pageSize).lean(), Contract.countDocuments(filter)]);
  res.json({ data: rows.map(dto), meta: { page, pageSize, total } });
}));

contractRouter.get('/contracts/:id', view, wrap(async (req, res) => {
  const id = idOf(req.params.id);
  const c = id && await Contract.findOne({ _id: id, organizationId: orgOf(req) }).lean();
  if (!c) throw notFound();
  res.json({ data: dto(c) });
}));

/** A new contract is a draft until activated. Fixed-term and probation contracts must have an end date. */
contractRouter.post('/contracts', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const body = req.body ?? {};
  const errors = new Errors();
  const terms = checkTerms(body, false, errors);
  const empId = idOf(body.employeeId);
  const employee = empId && await Employee.findOne({ _id: empId, organizationId: org }, { employeeNo: 1, status: 1 }).lean();
  if (!employee) errors.add('employeeId', 'Unknown employee.');
  else if (['terminated', 'archived'].includes(employee.status)) errors.add('employeeId', 'This employee has left.');
  if (['fixed_term', 'probation'].includes(String(terms.type)) && !terms.endDate) errors.add('endDate', 'A fixed-term contract needs an end date.');
  if (terms.endDate && terms.startDate && String(terms.endDate) <= String(terms.startDate)) errors.add('endDate', 'The end date must be after the start date.');
  errors.throwIfAny();
  const n = await Contract.countDocuments({ organizationId: org, employeeId: empId });
  const doc = await Contract.create({ ...terms, organizationId: org, employeeId: empId, number: `${employee!.employeeNo}-C${n + 1}`, createdBy: req.auth!.userId });
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.contract.created', entityType: 'Contract', entityId: String(doc._id), ip: req.ip });
  res.status(201).json({ data: dto(doc.toObject()) });
}));

/** draft -> active. A second live contract overlapping the same dates is refused; activating a renewal closes the one it renews. */
contractRouter.post('/contracts/:id/activate', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const session = await mongoose.startSession();
  try {
    const out = await session.withTransaction(async () => {
      const c = id && await Contract.findOne({ _id: id, organizationId: org }, null, { session });
      if (!c) throw notFound();
      if (!canMoveContract(c.status, 'active')) throw new HttpError(422, 'The given data was invalid.', { status: [`A ${c.status} contract cannot be activated.`] });
      const others = await Contract.find({ organizationId: org, employeeId: c.employeeId, status: 'active', _id: { $ne: c._id } }, null, { session }).lean();
      const prev = c.previousContractId;
      if (others.some((o) => String(o._id) !== String(prev) && overlaps({ start: c.startDate, end: c.endDate }, { start: o.startDate, end: o.endDate }))) {
        throw new HttpError(422, 'The given data was invalid.', { startDate: ['Another active contract covers these dates.'] });
      }
      if (prev) await Contract.updateOne({ _id: prev, organizationId: org, status: 'active' }, { $set: { status: 'renewed' } }, { session });
      c.status = 'active';
      await c.save({ session });
      if (c.probationMonths) {
        const d = new Date(c.startDate); d.setUTCMonth(d.getUTCMonth() + c.probationMonths);
        await Employee.updateOne({ _id: c.employeeId, organizationId: org }, { $set: { probationEndDate: d.toISOString().slice(0, 10) } }, { session });
      }
      return c.toObject();
    });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.contract.activated', entityType: 'Contract', entityId: String(id), ip: req.ip });
    res.json({ data: dto(out) });
  } finally { await session.endSession(); }
}));

/** Draws up the next version. It must start the day after the current one ends, so cover is continuous. It stays a draft until activated. */
contractRouter.post('/contracts/:id/renew', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const prev = id && await Contract.findOne({ _id: id, organizationId: org }).lean();
  if (!prev) throw notFound();
  const errors = new Errors();
  if (prev.status !== 'active') errors.add('status', 'Only an active contract can be renewed.');
  else if (!prev.endDate) errors.add('status', 'A contract with no end date does not need renewal.');
  else if (await Contract.exists({ organizationId: org, previousContractId: prev._id, status: { $in: ['draft', 'active'] } })) errors.add('status', 'A renewal is already in progress.');
  const body = req.body ?? {};
  const terms = checkTerms({ ...body, type: body.type ?? prev.type, startDate: body.startDate ?? (prev.endDate ? renewalStart(prev.endDate) : undefined) }, false, errors);
  if (prev.endDate && terms.startDate && terms.startDate !== renewalStart(prev.endDate)) errors.add('startDate', `A renewal must start on ${renewalStart(prev.endDate)}, the day after this contract ends.`);
  if (terms.endDate && terms.startDate && String(terms.endDate) <= String(terms.startDate)) errors.add('endDate', 'The end date must be after the start date.');
  errors.throwIfAny();
  const doc = await Contract.create({ ...terms, organizationId: org, employeeId: prev.employeeId, number: `${prev.number.replace(/-V\d+$/, '')}-V${prev.version + 1}`, version: prev.version + 1, previousContractId: prev._id, createdBy: req.auth!.userId });
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.contract.renewal_drafted', entityType: 'Contract', entityId: String(doc._id), before: { renews: String(prev._id) }, ip: req.ip });
  res.status(201).json({ data: dto(doc.toObject()) });
}));

/** Changes to a live contract are recorded as amendments with a reason; the original terms stay in the amendment log. */
contractRouter.post('/contracts/:id/amend', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const c = id && await Contract.findOne({ _id: id, organizationId: org });
  if (!c) throw notFound();
  const errors = new Errors();
  const body = req.body ?? {};
  const reason = text(body.reason, 500);
  if (!reason) errors.add('reason', 'Required.');
  if (c.status !== 'active') errors.add('status', 'Only an active contract can be amended.');
  const allowed: Record<string, any> = {};
  for (const k of ['endDate', 'renewalTerms', 'alertDays']) if (k in body) allowed[k] = body[k];
  const terms = checkTerms(allowed, true, errors);
  if (!Object.keys(terms).length) errors.add('changes', 'Nothing to change.');
  if (terms.endDate && String(terms.endDate) <= c.startDate) errors.add('endDate', 'The end date must be after the start date.');
  if (terms.endDate && String(terms.endDate) < todayIso()) errors.add('endDate', 'The end date cannot be in the past.');
  errors.throwIfAny();
  const changes = Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, { from: (c as any)[k] ?? null, to: v }]));
  Object.assign(c, terms);
  c.amendments.push({ at: new Date(), by: req.auth!.userId, reason, changes } as any);
  await c.save();
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.contract.amended', entityType: 'Contract', entityId: String(id), after: changes, ip: req.ip });
  res.json({ data: dto(c.toObject()) });
}));

contractRouter.post('/contracts/:id/terminate', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const c = id && await Contract.findOne({ _id: id, organizationId: org });
  if (!c) throw notFound();
  const errors = new Errors();
  if (!canMoveContract(c.status, 'terminated')) errors.add('status', `A ${c.status} contract cannot be terminated.`);
  const reason = text(req.body?.reason, 500);
  if (!reason) errors.add('reason', 'Required.');
  const date = req.body?.date ?? todayIso();
  if (!isDate(date)) errors.add('date', 'Use the format YYYY-MM-DD.');
  errors.throwIfAny();
  c.status = 'terminated';
  c.termination = { date, reason, by: req.auth!.userId } as any;
  await c.save();
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.contract.terminated', entityType: 'Contract', entityId: String(id), after: { reason, date }, ip: req.ip });
  res.json({ data: dto(c.toObject()) });
}));

/**
 * Marks active contracts whose end date has passed as expired. Safe to run repeatedly (a contract can only expire once).
 * Called by a scheduled job; the endpoint exists so an administrator can run it on demand.
 */
export async function expireDue(organizationId?: mongoose.Types.ObjectId, today = todayIso()): Promise<number> {
  const r = await Contract.updateMany({ ...(organizationId ? { organizationId } : {}), status: 'active', endDate: { $lt: today } }, { $set: { status: 'expired' } });
  return r.modifiedCount;
}
contractRouter.post('/contracts-expire-due', manage, wrap(async (req, res) => {
  res.json({ data: { expired: await expireDue(orgOf(req)) } });
}));

/** The signed-in employee's own contracts. */
export const meContractRouter = Router();
meContractRouter.get('/contracts', wrap(async (req, res) => {
  const a = await accessOf(req);
  if (!a.me) throw notFound();
  const rows = await Contract.find({ organizationId: orgOf(req), employeeId: a.me._id, status: { $ne: 'draft' } }).sort({ startDate: -1 }).lean();
  void isSelf; // the filter above is already restricted to the caller's own employee id
  res.json({ data: rows.map(dto) });
}));
