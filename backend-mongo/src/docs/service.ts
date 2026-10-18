import { Types } from 'mongoose';
import { appendAudit } from '../db/audit-chain.js';
import { env } from '../config/env.js';
import { HttpError } from '../hr/common.js';
import { evaluateStatus, canTransition, DATED } from './lifecycle.js';
import { DocDocument, SmartDocType, type DocFieldDef, type DocStatus } from './models.js';

export const todayIn = (tz: string = env.docs.timezone, now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

export interface Actor { id?: Types.ObjectId; ip?: string }
const ENTITY = 'SmartDocument';

/**
 * Drops empty objects and undefined values. MongoDB does not keep an empty object in a Mixed field, so the audit hash must be computed
 * on the same shape that is read back, or `audit:verify` would report a break that did not happen.
 */
export function pruned(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(pruned);
  if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Types.ObjectId)) {
    const o = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, pruned(x)]).filter(([, x]) => !(x && typeof x === 'object' && !(x instanceof Date) && !Array.isArray(x) && Object.keys(x as object).length === 0)));
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}

export async function audit(org: Types.ObjectId, actor: Actor, action: string, docId: Types.ObjectId | string, before?: unknown, after?: unknown): Promise<void> {
  await appendAudit({ organizationId: org, actorId: actor.id, action: `docs.${action}`, entityType: ENTITY, entityId: String(docId), before: pruned(before), after: pruned(after), ip: actor.ip });
}

export const typeOf = async (org: Types.ObjectId, key: string) => SmartDocType.findOne({ organizationId: org, key }).lean();

/** Moves a document to a new status through the allowed table. Throws 409 for a move the lifecycle does not allow. */
export async function setStatus(doc: InstanceType<typeof DocDocument>, to: DocStatus, actor: Actor, reason?: string): Promise<void> {
  if (doc.status === to) return;
  if (!canTransition(doc.status, to)) throw new HttpError(409, `A ${doc.status.replace(/_/g, ' ')} document cannot become ${to.replace(/_/g, ' ')}.`);
  const from = doc.status;
  doc.status = to;
  if (to === 'archived') doc.archivedAt = new Date();
  await doc.save();
  await audit(doc.organizationId, actor, 'status', doc._id, { status: from }, { status: to, reason });
}

/** Applies the expiry rules to one document: approved, active, expiring soon, expired. Returns true when the status changed. */
export async function reevaluate(doc: InstanceType<typeof DocDocument>, today = todayIn(), actor: Actor = {}): Promise<boolean> {
  if (!DATED.includes(doc.status)) return false;
  const type = await typeOf(doc.organizationId, doc.typeKey);
  const next = evaluateStatus({ status: doc.status, expiryDate: doc.expiryDate, startDate: doc.startDate, today, expiringSoonDays: type?.expiringSoonDays ?? 30 });
  if (next === doc.status) return false;
  await setStatus(doc, next, actor, 'date rules');
  return true;
}

/** Hides fields marked sensitive from people without `documents.sensitive`. */
export function maskValues(fields: DocFieldDef[], values: Record<string, unknown> | undefined, canSee: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(values ?? {}) };
  if (!canSee) for (const f of fields) if (f.sensitive && f.key in out) delete out[f.key];
  return out;
}
