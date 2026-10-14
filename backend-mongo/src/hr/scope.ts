import type { Request } from 'express';
import { Types } from 'mongoose';
import { Employee } from './models.js';
import { notFound, orgOf } from './common.js';

export interface Access {
  /** hr.employees.view: the whole office. */
  office: boolean;
  manage: boolean;
  bank: boolean;
  /** The caller's own employee record, when they have one. */
  me: { _id: Types.ObjectId } | null;
}

export async function accessOf(req: Request): Promise<Access> {
  const p = req.auth!.permissions;
  const me = await Employee.findOne({ organizationId: orgOf(req), userId: req.auth!.userId }, { _id: 1 }).lean();
  return { office: p.includes('hr.employees.view'), manage: p.includes('hr.employees.manage'), bank: p.includes('hr.bank.view'), me };
}

/** Which employees a caller may read: everyone, or themself plus their direct reports. */
export const visibleFilter = (a: Access, org: Types.ObjectId): Record<string, unknown> =>
  a.office ? { organizationId: org } : a.me ? { organizationId: org, $or: [{ _id: a.me._id }, { managerId: a.me._id }] } : { organizationId: org, _id: null };

export const isSelf = (a: Access, id: Types.ObjectId | string): boolean => !!a.me && String(a.me._id) === String(id);

/** Unknown, other-office and not-yours all answer 404, so ids cannot be probed. */
export async function loadVisible(req: Request, id: Types.ObjectId | null, select = ''): Promise<{ doc: any; access: Access }> {
  const access = await accessOf(req);
  const doc = id && await Employee.findOne({ ...visibleFilter(access, orgOf(req)), _id: id }).select(select).lean();
  if (!doc) throw notFound();
  return { doc, access };
}
