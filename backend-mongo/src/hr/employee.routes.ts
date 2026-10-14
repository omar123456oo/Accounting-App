import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { appendAudit } from '../db/audit-chain.js';
import { can } from '../auth/session.js';
import { Errors, HttpError, escapeRegex, idOf, isDate, isDuplicateKey, notFound, orgOf, pageOf, text, todayIso, wrap } from './common.js';
import { Branch, Contract, Counter, Department, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, Employee, EmployeeEvent, Grade, Position } from './models.js';
import { canMove, wouldCycle } from './rules.js';
import { Access, accessOf, isSelf, loadVisible, visibleFilter } from './scope.js';

export const employeeRouter = Router();
const manage = can('hr.employees.manage');

/** Fields whose change is written to the employee's history with an effective date. */
const TRACKED = ['departmentId', 'branchId', 'positionId', 'gradeId', 'managerId', 'employmentType', 'workLocation'] as const;
const PLAIN = ['firstName', 'lastName', 'nameAr', 'email', 'phone', 'dateOfBirth', 'gender', 'address', 'hireDate', 'probationEndDate', 'confirmationDate', 'employmentType', 'workLocation'] as const;
const REFS: Record<string, any> = { departmentId: Department, branchId: Branch, positionId: Position, gradeId: Grade, managerId: Employee };

/** What a caller may see of an employee. Sensitive fields are never selected by default and are added only for those entitled to them. */
function dto(e: any, a: Access) {
  const self = isSelf(a, e._id);
  const out: Record<string, unknown> = { ...e, id: String(e._id) };
  delete out._id; delete out.__v; delete out.organizationId;
  for (const k of ['departmentId', 'branchId', 'positionId', 'gradeId', 'managerId', 'userId'] as const) out[k] = e[k] ? String(e[k]) : null;
  if (!(a.manage || self)) delete out.nationalId;
  if (!(a.bank || self)) delete out.bank;
  if (!a.manage) delete out.notes;
  return out;
}

async function nextNumber(org: Types.ObjectId, session?: mongoose.ClientSession): Promise<string> {
  const c = await Counter.findOneAndUpdate({ organizationId: org, key: 'employeeNo' }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return `EMP-${String(c.seq).padStart(5, '0')}`;
}

async function validate(req: Parameters<typeof orgOf>[0], body: Record<string, any>, partial: boolean, self?: Types.ObjectId) {
  const errors = new Errors();
  const org = orgOf(req);
  const set: Record<string, unknown> = {};
  for (const f of PLAIN) {
    if (!(f in body)) continue;
    if (['hireDate', 'probationEndDate', 'confirmationDate', 'dateOfBirth'].includes(f)) {
      if (body[f] === null || body[f] === '') { if (f === 'hireDate') errors.add(f, 'Required.'); continue; }
      if (!isDate(body[f])) errors.add(f, 'Use the format YYYY-MM-DD.'); else set[f] = body[f];
    } else if (f === 'employmentType') {
      if (!(EMPLOYMENT_TYPES as readonly string[]).includes(body[f])) errors.add(f, 'Unknown employment type.'); else set[f] = body[f];
    } else if (f === 'gender') {
      if (body[f] && !['female', 'male'].includes(body[f])) errors.add(f, 'Unknown value.'); else if (body[f]) set[f] = body[f];
    } else if (f === 'email') {
      const v = text(body[f]);
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.add(f, 'Enter a valid e-mail address.'); else if (v) set[f] = v.toLowerCase();
    } else {
      const v = text(body[f]);
      if (!v && ['firstName', 'lastName'].includes(f)) errors.add(f, 'Required.'); else if (v !== undefined) set[f] = v;
    }
  }
  if (!partial) for (const f of ['firstName', 'lastName', 'employmentType', 'hireDate']) if (!(f in set) && !errors.map[f]) errors.add(f, 'Required.');
  if (set.probationEndDate && set.hireDate && set.probationEndDate < set.hireDate) errors.add('probationEndDate', 'Probation cannot end before the hire date.');
  for (const [f, v] of [['nationalId', body.nationalId], ['notes', body.notes]] as const) if (v !== undefined) set[f] = text(v, 2000) ?? null;
  if (body.skills !== undefined) set.skills = Array.isArray(body.skills) ? body.skills.map((s: unknown) => text(s, 60)).filter(Boolean).slice(0, 50) : [];
  for (const f of ['emergencyContacts', 'education', 'certifications', 'previousEmployment'] as const) if (body[f] !== undefined) set[f] = Array.isArray(body[f]) ? body[f].slice(0, 30) : [];
  if (body.emergencyContacts !== undefined && (set.emergencyContacts as any[]).some((c) => !text(c?.name) || !text(c?.phone))) errors.add('emergencyContacts', 'Each contact needs a name and a phone.');
  if (body.bank !== undefined) set.bank = body.bank && typeof body.bank === 'object' ? { bankName: text(body.bank.bankName), accountName: text(body.bank.accountName), iban: text(body.bank.iban, 40) } : null;
  for (const [f, model] of Object.entries(REFS)) {
    if (!(f in body)) continue;
    if (body[f] === null || body[f] === '') { set[f] = null; continue; }
    const id = idOf(body[f]);
    if (!id || !(await model.exists({ _id: id, organizationId: org, ...(f === 'managerId' ? {} : { active: true }) }))) errors.add(f, 'Unknown reference.');
    else set[f] = id;
  }
  // Reporting lines must stay a tree.
  const manager = set.managerId as Types.ObjectId | null | undefined;
  if (manager) {
    if (self && String(manager) === String(self)) errors.add('managerId', 'An employee cannot report to themself.');
    else if (self && await wouldCycle(String(self), String(manager), async (id) => {
      const e = await Employee.findOne({ _id: id, organizationId: org }, { managerId: 1 }).lean();
      return e?.managerId ? String(e.managerId) : null;
    })) errors.add('managerId', 'This would make the reporting line a circle.');
  }
  errors.throwIfAny();
  return set;
}

employeeRouter.get('/employees', wrap(async (req, res) => {
  const a = await accessOf(req);
  const org = orgOf(req);
  const filter: Record<string, any> = visibleFilter(a, org);
  const q = text(req.query.q, 80);
  if (q) filter.$and = [{ $or: ['firstName', 'lastName', 'nameAr', 'employeeNo', 'email'].map((f) => ({ [f]: new RegExp(escapeRegex(q), 'i') })) }];
  if (typeof req.query.status === 'string' && (EMPLOYEE_STATUSES as readonly string[]).includes(req.query.status)) filter.status = req.query.status;
  else if (req.query.includeArchived !== 'true') filter.status = { $ne: 'archived' };
  for (const f of ['departmentId', 'branchId', 'positionId', 'managerId'] as const) { const id = idOf(req.query[f]); if (id) filter[f] = id; }
  const sortKey = ['employeeNo', 'firstName', 'lastName', 'hireDate', 'status'].includes(String(req.query.sort)) ? String(req.query.sort) : 'employeeNo';
  const { page, pageSize, skip } = pageOf(req.query);
  const [rows, total] = await Promise.all([
    Employee.find(filter).sort({ [sortKey]: req.query.dir === 'desc' ? -1 : 1, _id: 1 }).skip(skip).limit(pageSize).lean(),
    Employee.countDocuments(filter),
  ]);
  res.json({ data: rows.map((e) => dto(e, a)), meta: { page, pageSize, total } });
}));

/** CSV of exactly what the list shows the caller; sensitive columns follow the same rules as the screen. */
employeeRouter.get('/employees-export', can('hr.reports.view'), wrap(async (req, res) => {
  const a = await accessOf(req);
  const rows = await Employee.find({ ...visibleFilter(a, orgOf(req)), status: { $ne: 'archived' } }).sort({ employeeNo: 1 }).limit(5000).lean();
  const cell = (v: unknown) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; }; // blocks spreadsheet formula injection
  const head = ['employeeNo', 'firstName', 'lastName', 'email', 'phone', 'employmentType', 'status', 'hireDate'];
  res.type('text/csv').attachment('employees.csv').send([head.join(','), ...rows.map((r: any) => head.map((h) => cell(r[h])).join(','))].join('\n'));
}));

employeeRouter.post('/employees', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const set = await validate(req, req.body ?? {}, false);
  const errors = new Errors();
  const supplied = text(req.body?.employeeNo, 30);
  if (req.body?.userId !== undefined && req.body.userId !== null) {
    const uid = idOf(req.body.userId);
    const user = uid && await mongoose.model('User').findOne({ _id: uid, organizationId: org, type: 'staff' }, { _id: 1 }).lean();
    if (!user) errors.add('userId', 'Unknown user.'); else set.userId = uid;
  }
  errors.throwIfAny();
  try {
    const employee = await Employee.create({ ...set, employeeNo: supplied ?? await nextNumber(org), organizationId: org, status: 'active' });
    await EmployeeEvent.create({ organizationId: org, employeeId: employee._id, kind: 'hired', effectiveFrom: String(set.hireDate), actorId: req.auth!.userId, changes: { employeeNo: employee.employeeNo } });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.employee.created', entityType: 'Employee', entityId: String(employee._id), after: { employeeNo: employee.employeeNo }, ip: req.ip });
    const a = await accessOf(req);
    res.status(201).json({ data: dto((await Employee.findById(employee._id).select('+nationalId +bank +notes').lean())!, a) });
  } catch (e) {
    if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { [String((e as any).keyPattern?.userId ? 'userId' : 'employeeNo')]: ['Already in use.'] });
    throw e;
  }
}));

employeeRouter.get('/employees/:id', wrap(async (req, res) => {
  const { doc, access } = await loadVisible(req, idOf(req.params.id), '+nationalId +bank +notes');
  res.json({ data: dto(doc, access) });
}));

employeeRouter.patch('/employees/:id', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const current = id && await Employee.findOne({ _id: id, organizationId: org }).select('+nationalId +bank +notes').lean();
  if (!id || !current) throw notFound();
  if (current.status === 'archived') throw new HttpError(422, 'Archived records cannot be edited.');
  const body = req.body ?? {};
  const set = await validate(req, body, true, id);
  let effectiveFrom = todayIso();
  if (body.effectiveFrom !== undefined) {
    if (!isDate(body.effectiveFrom) || body.effectiveFrom > todayIso()) throw new HttpError(422, 'The given data was invalid.', { effectiveFrom: ['Use today or an earlier date (future-dated changes are not supported yet).'] });
    effectiveFrom = body.effectiveFrom;
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of TRACKED) {
    if (!(f in set)) continue;
    const from = (current as any)[f] ? String((current as any)[f]) : null;
    const to = set[f] ? String(set[f]) : null;
    if (from !== to) changes[f] = { from, to };
  }
  try {
    const updated = await Employee.findOneAndUpdate({ _id: id, organizationId: org }, { $set: set }, { new: true }).select('+nationalId +bank +notes').lean();
    if (Object.keys(changes).length) await EmployeeEvent.create({ organizationId: org, employeeId: id, kind: 'changed', effectiveFrom, changes, actorId: req.auth!.userId, note: text(body.note, 500) });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.employee.updated', entityType: 'Employee', entityId: String(id), after: { fields: Object.keys(set) }, ip: req.ip });
    res.json({ data: dto(updated, await accessOf(req)) });
  } catch (e) {
    if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { userId: ['Already in use.'] });
    throw e;
  }
}));

/** Explicit status moves. Termination records the exit and ends the employee's live contracts in the same transaction. */
employeeRouter.post('/employees/:id/status', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const to = String(req.body?.to ?? '');
  const reason = text(req.body?.reason, 500);
  const exitDate = req.body?.exitDate;
  const errors = new Errors();
  if (!(EMPLOYEE_STATUSES as readonly string[]).includes(to)) errors.add('to', 'Unknown status.');
  if (to === 'terminated') {
    if (!reason) errors.add('reason', 'Required.');
    if (!isDate(exitDate)) errors.add('exitDate', 'Use the format YYYY-MM-DD.');
  }
  errors.throwIfAny();
  const session = await mongoose.startSession();
  try {
    const out = await session.withTransaction(async () => {
      const current = id && await Employee.findOne({ _id: id, organizationId: org }, null, { session }).lean();
      if (!id || !current) throw notFound();
      if (!canMove(current.status, to)) throw new HttpError(422, 'The given data was invalid.', { to: [`Cannot move from ${current.status} to ${to}.`] });
      const $set: Record<string, unknown> = { status: to };
      if (to === 'terminated') $set.exit = { date: exitDate, reason, rehireEligible: req.body?.rehireEligible !== false };
      if (to === 'archived') $set.archivedAt = new Date();
      await Employee.updateOne({ _id: id }, { $set }, { session });
      if (to === 'terminated') {
        await Contract.updateMany({ organizationId: org, employeeId: id, status: { $in: ['draft', 'active'] } }, { $set: { status: 'terminated', termination: { date: exitDate, reason: 'Employee terminated', by: req.auth!.userId } } }, { session });
      }
      await EmployeeEvent.create([{ organizationId: org, employeeId: id, kind: 'status', effectiveFrom: to === 'terminated' ? exitDate : todayIso(), changes: { status: { from: current.status, to } }, note: reason, actorId: req.auth!.userId }], { session });
      return Employee.findById(id).session(session).lean();
    });
    await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: `hr.employee.${to}`, entityType: 'Employee', entityId: String(id), after: { reason }, ip: req.ip });
    res.json({ data: dto(out, await accessOf(req)) });
  } finally { await session.endSession(); }
}));

/** Brings a terminated employee back as an active one, if the exit allowed it. Same employee number, new hire date, history kept. */
employeeRouter.post('/employees/:id/rehire', manage, wrap(async (req, res) => {
  const org = orgOf(req);
  const id = idOf(req.params.id);
  const current = id && await Employee.findOne({ _id: id, organizationId: org }).lean();
  if (!id || !current) throw notFound();
  if (current.status !== 'terminated') throw new HttpError(422, 'Only terminated employees can be rehired.');
  if (current.exit?.rehireEligible === false) throw new HttpError(422, 'This employee was marked not eligible for rehire.');
  if (!isDate(req.body?.hireDate)) throw new HttpError(422, 'The given data was invalid.', { hireDate: ['Use the format YYYY-MM-DD.'] });
  await Employee.updateOne({ _id: id }, { $set: { status: 'active', hireDate: req.body.hireDate }, $unset: { exit: 1, probationEndDate: 1, confirmationDate: 1 } });
  await EmployeeEvent.create({ organizationId: org, employeeId: id, kind: 'rehired', effectiveFrom: req.body.hireDate, actorId: req.auth!.userId, changes: { previousExit: current.exit } });
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'hr.employee.rehired', entityType: 'Employee', entityId: String(id), ip: req.ip });
  res.json({ data: dto((await Employee.findById(id).lean())!, await accessOf(req)) });
}));

employeeRouter.get('/employees/:id/history', wrap(async (req, res) => {
  const { doc } = await loadVisible(req, idOf(req.params.id));
  const rows = await EmployeeEvent.find({ organizationId: orgOf(req), employeeId: doc._id }).sort({ at: -1 }).limit(200).lean();
  res.json({ data: rows.map((r: any) => ({ id: String(r._id), kind: r.kind, effectiveFrom: r.effectiveFrom, changes: r.changes, note: r.note, at: r.at, actorId: r.actorId ? String(r.actorId) : null })) });
}));

/** The employee record of whoever is signed in; no id is accepted, so there is nothing to tamper with. */
export const meRouter = Router();
meRouter.get('/employee', wrap(async (req, res) => {
  const me = await Employee.findOne({ organizationId: orgOf(req), userId: req.auth!.userId }).select('+nationalId +bank').lean();
  if (!me) throw notFound();
  res.json({ data: dto(me, { office: false, manage: false, bank: false, me }) });
}));
