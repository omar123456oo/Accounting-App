import type { Request } from 'express';
import { Types } from 'mongoose';
import { HttpError, notFound, orgOf } from '../hr/common.js';
import { DocDocument, SmartDocType, type DocFieldDef } from './models.js';
import { maskValues } from './service.js';

export const has = (req: Request, p: string): boolean => req.auth!.permissions.includes(p);
export const forbidden = (): HttpError => new HttpError(403, 'Forbidden.');

/**
 * Which documents a person may open. Everyone with `documents.view` sees office-wide documents; restricted ones and documents about an
 * employee need a closer tie (creator, owner, reviewer, HR access or `documents.manage`). Anything outside this answers 404, never 403.
 */
export function visibleFilter(req: Request): Record<string, unknown> {
  const org = orgOf(req);
  const base: Record<string, unknown> = { organizationId: org, deletedAt: { $exists: false } };
  if (has(req, 'documents.manage')) return base;
  const me = req.auth!.userId;
  const hr = has(req, 'hr.employees.view');
  return { ...base, $or: [{ createdBy: me }, { ownerId: me }, { reviewerId: me }, { visibility: { $ne: 'restricted' }, ...(hr ? {} : { employeeId: null }) }] };
}

export async function loadDoc(req: Request, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f]{24}$/i.test(id)) throw notFound();
  const doc = await DocDocument.findOne({ ...visibleFilter(req), _id: new Types.ObjectId(id) });
  if (!doc) throw notFound();
  return doc;
}

export async function fieldsOf(org: Types.ObjectId, typeKey: string): Promise<DocFieldDef[]> {
  return (((await SmartDocType.findOne({ organizationId: org, key: typeKey }).lean())?.fields) ?? []) as DocFieldDef[];
}

export const sensitiveKeys = (fields: DocFieldDef[]): Set<string> => new Set(fields.filter((f) => f.sensitive).map((f) => f.key));

export function docDto(d: any, fields: DocFieldDef[], req: Request, extra: Record<string, unknown> = {}) {
  return {
    id: String(d._id), title: d.title, number: d.number ?? null, typeKey: d.typeKey, typeChosen: d.typeChosen, status: d.status, extractionStatus: d.extractionStatus, reminderStatus: d.reminderStatus,
    visibility: d.visibility, ownerId: d.ownerId ? String(d.ownerId) : null, employeeId: d.employeeId ? String(d.employeeId) : null, departmentId: d.departmentId ? String(d.departmentId) : null,
    reviewerId: d.reviewerId ? String(d.reviewerId) : null, related: d.related?.kind ? { kind: d.related.kind, id: d.related.id } : null,
    values: maskValues(fields, d.values, has(req, 'documents.sensitive')),
    expiryDate: d.expiryDate ?? null, startDate: d.startDate ?? null, endDate: d.endDate ?? null, renewalDate: d.renewalDate ?? null,
    currentVersion: d.currentVersion, approvedAt: d.approvedAt ?? null, createdAt: d.createdAt, updatedAt: d.updatedAt, ...extra,
  };
}
