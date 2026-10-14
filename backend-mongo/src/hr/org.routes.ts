import { Router } from 'express';
import { Model, Types } from 'mongoose';
import { appendAudit } from '../db/audit-chain.js';
import { can } from '../auth/session.js';
import { Errors, HttpError, idOf, isDuplicateKey, notFound, orgOf, text, wrap } from './common.js';
import { Branch, Department, Employee, Grade, Position } from './models.js';
import { wouldCycle } from './rules.js';

export const orgRouter = Router();
const view = can('hr.employees.view');
const manage = can('hr.org.manage');

interface Kind {
  path: string;
  model: Model<any>;
  entity: string;
  /** Fields a client may set (everything else is ignored, so ids and organizationId can never be injected). */
  fields: string[];
  required: string[];
  numeric?: string[];
}

const KINDS: Kind[] = [
  { path: 'branches', model: Branch, entity: 'Branch', fields: ['code', 'name', 'nameAr', 'address'], required: ['code', 'name'] },
  { path: 'grades', model: Grade, entity: 'Grade', fields: ['code', 'name', 'level'], required: ['code', 'name', 'level'], numeric: ['level'] },
  { path: 'positions', model: Position, entity: 'Position', fields: ['code', 'title', 'titleAr', 'description'], required: ['code', 'title'] },
  { path: 'departments', model: Department, entity: 'Department', fields: ['code', 'name', 'nameAr', 'costCenter'], required: ['code', 'name'] },
];

const dto = (d: any) => ({ ...d, id: String(d._id), _id: undefined, __v: undefined, organizationId: undefined });

/** Validates reference fields that point into the same organization. */
async function refs(req: Parameters<typeof orgOf>[0], body: Record<string, unknown>, kind: Kind, errors: Errors, self?: Types.ObjectId) {
  const out: Record<string, Types.ObjectId | null> = {};
  const org = orgOf(req);
  const link = async (field: string, model: Model<any>) => {
    if (!(field in body)) return;
    if (body[field] === null || body[field] === '') { out[field] = null; return; }
    const id = idOf(body[field]);
    if (!id || !(await model.exists({ _id: id, organizationId: org }))) errors.add(field, 'Unknown reference.');
    else out[field] = id;
  };
  if (kind.path === 'positions') { await link('departmentId', Department); await link('gradeId', Grade); }
  if (kind.path === 'departments') {
    await link('parentId', Department);
    await link('managerId', Employee);
    const parent = out['parentId'];
    if (self && parent && await wouldCycle(String(self), String(parent), async (id) => {
      const d = await Department.findOne({ _id: id, organizationId: org }, { parentId: 1 }).lean();
      return d?.parentId ? String(d.parentId) : null;
    })) errors.add('parentId', 'A department cannot sit under itself or one of its own sub-departments.');
  }
  return out;
}

function clean(body: Record<string, unknown>, kind: Kind, errors: Errors, partial: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of kind.fields) {
    if (!(f in body)) { if (!partial && kind.required.includes(f)) errors.add(f, 'Required.'); continue; }
    if (kind.numeric?.includes(f)) {
      const n = Number(body[f]);
      if (!Number.isFinite(n) || n < 0 || n > 1000) errors.add(f, 'Enter a number between 0 and 1000.'); else out[f] = n;
    } else {
      const v = text(body[f]);
      if (!v && kind.required.includes(f)) errors.add(f, 'Required.'); else out[f] = v;
    }
  }
  if (typeof body['active'] === 'boolean') out['active'] = body['active'];
  return out;
}

for (const kind of KINDS) {
  orgRouter.get(`/${kind.path}`, view, wrap(async (req, res) => {
    const filter: Record<string, unknown> = { organizationId: orgOf(req) };
    if (req.query.active === 'true') filter.active = true;
    res.json({ data: (await kind.model.find(filter).sort({ code: 1 }).lean()).map(dto) });
  }));

  orgRouter.post(`/${kind.path}`, manage, wrap(async (req, res) => {
    const errors = new Errors();
    const data = { ...clean(req.body ?? {}, kind, errors, false), ...await refs(req, req.body ?? {}, kind, errors) };
    errors.throwIfAny();
    try {
      const doc = await kind.model.create({ ...data, organizationId: orgOf(req) });
      await appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action: `hr.${kind.path}.created`, entityType: kind.entity, entityId: String(doc._id), after: data, ip: req.ip });
      res.status(201).json({ data: dto(doc.toObject()) });
    } catch (e) {
      if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { code: ['This code is already used.'] });
      throw e;
    }
  }));

  orgRouter.patch(`/${kind.path}/:id`, manage, wrap(async (req, res) => {
    const id = idOf(req.params.id);
    const org = orgOf(req);
    const current: any = id && await kind.model.findOne({ _id: id, organizationId: org }).lean();
    if (!id || !current) throw notFound();
    const errors = new Errors();
    const data = { ...clean(req.body ?? {}, kind, errors, true), ...await refs(req, req.body ?? {}, kind, errors, id) };
    // History matters: a unit with active people in it cannot be switched off, so no employee points at a closed unit.
    if (data['active'] === false && current.active !== false) {
      const field = { branches: 'branchId', departments: 'departmentId', positions: 'positionId', grades: 'gradeId' }[kind.path]!;
      if (await Employee.exists({ organizationId: org, [field]: id, status: { $in: ['active', 'inactive'] } })) errors.add('active', 'Move or end the employees assigned here first.');
      if (kind.path === 'departments' && await Department.exists({ organizationId: org, parentId: id, active: true })) errors.add('active', 'Close the sub-departments first.');
    }
    errors.throwIfAny();
    try {
      const doc = await kind.model.findOneAndUpdate({ _id: id, organizationId: org }, { $set: data }, { new: true }).lean();
      await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: `hr.${kind.path}.updated`, entityType: kind.entity, entityId: String(id), before: current, after: data, ip: req.ip });
      res.json({ data: dto(doc) });
    } catch (e) {
      if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { code: ['This code is already used.'] });
      throw e;
    }
  }));
}

/** The department hierarchy as a nested tree, with head-counts of active employees. */
orgRouter.get('/departments-tree', view, wrap(async (req, res) => {
  const org = orgOf(req);
  const [departments, counts] = await Promise.all([
    Department.find({ organizationId: org }).sort({ code: 1 }).lean(),
    Employee.aggregate([{ $match: { organizationId: org, status: 'active' } }, { $group: { _id: '$departmentId', n: { $sum: 1 } } }]),
  ]);
  const count = new Map(counts.map((c) => [String(c._id), c.n as number]));
  const nodes = new Map(departments.map((d) => [String(d._id), { ...dto(d), parentId: d.parentId ? String(d.parentId) : null, headcount: count.get(String(d._id)) ?? 0, children: [] as unknown[] }]));
  const roots: unknown[] = [];
  for (const n of nodes.values()) (n.parentId && nodes.get(n.parentId) ? (nodes.get(n.parentId)!.children as unknown[]) : roots).push(n);
  res.json({ data: roots });
}));
