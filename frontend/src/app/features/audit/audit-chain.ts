import { AuditEvent, ChainVerdict } from './audit.models';

/** The hash of an empty chain: the prevHash of event 1. */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * The exact field concatenation that is hashed, in the idea of the Phase 1 audit design: previous hash, seq,
 * organization, actor, action, entity type, entity id, before, after and the timestamp, joined by "|".
 */
export function hashMaterial(e: Pick<AuditEvent, 'seq' | 'organizationId' | 'actorId' | 'action' | 'entityType' | 'entityId' | 'before' | 'after' | 'occurredAt'>, prevHash: string): string {
  return [prevHash, e.seq, e.organizationId, e.actorId, e.action, e.entityType, e.entityId, e.before, e.after, e.occurredAt].join('|');
}

export async function sha256Text(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function eventHash(e: Parameters<typeof hashMaterial>[0], prevHash: string): Promise<string> {
  return sha256Text(hashMaterial(e, prevHash));
}

/**
 * Recomputes the chain from the stored events (in seq order): the numbering must be contiguous, each prevHash
 * must be the previous event's hash and each hash must match its recomputed value. Returns the first broken seq.
 */
export async function verifyChain(events: readonly AuditEvent[]): Promise<ChainVerdict> {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  let expected = 1;
  for (const e of sorted) {
    if (e.seq !== expected || e.prevHash !== prev || e.hash !== (await eventHash(e, prev))) return { ok: false, firstBadSeq: e.seq, count: sorted.length };
    prev = e.hash;
    expected++;
  }
  return { ok: true, count: sorted.length };
}
