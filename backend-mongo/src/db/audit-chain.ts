import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { AuditChainHead, AuditEvent } from '../models/audit-event.js';

export interface AuditInput {
  organizationId: Types.ObjectId;
  actorId?: Types.ObjectId;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

const GENESIS = '0'.repeat(64);

/** Canonical JSON: keys sorted, so the hash does not depend on key order. */
const canon = (v: unknown): string => JSON.stringify(v ?? null, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

export const hashEvent = (prev: string, e: { seq: number; organizationId: Types.ObjectId | string; actorId?: Types.ObjectId | string | null; action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown; occurredAt: Date }): string =>
  createHash('sha256').update([
    prev, e.seq, String(e.organizationId), e.actorId ? String(e.actorId) : '', e.action, e.entityType, e.entityId ?? '',
    e.before == null ? '' : canon(e.before), e.after == null ? '' : canon(e.after), e.occurredAt.toISOString(),
  ].join('|')).digest('hex');

/** Appends one event. Runs in a transaction (replica set) so concurrent writers to one organization serialise on the chain head. */
export async function appendAudit(input: AuditInput) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const head = await AuditChainHead.findOneAndUpdate(
        { organizationId: input.organizationId }, { $setOnInsert: { lastSeq: 0, lastHash: GENESIS } },
        { upsert: true, new: true, session });
      const seq = head.lastSeq + 1;
      const occurredAt = new Date();
      const hash = hashEvent(head.lastHash, { ...input, seq, occurredAt });
      const [doc] = await AuditEvent.create([{ ...input, seq, occurredAt, prevHash: head.lastHash, hash }], { session });
      await AuditChainHead.updateOne({ organizationId: input.organizationId }, { lastSeq: seq, lastHash: hash }, { session });
      return doc;
    });
  } finally {
    await session.endSession();
  }
}

/** Recomputes the chain in seq order; returns the first bad seq, or null when intact. */
export async function verifyChain(organizationId: Types.ObjectId): Promise<number | null> {
  let prev = GENESIS;
  let expected = 1;
  for await (const e of AuditEvent.find({ organizationId }).sort({ seq: 1 }).lean()) {
    if (e.seq !== expected || e.prevHash !== prev || e.hash !== hashEvent(prev, e)) return e.seq;
    prev = e.hash;
    expected++;
  }
  return null;
}
