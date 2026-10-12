/** One link of the per-organization audit chain. `hash` covers the fields below and `prevHash`, so editing any stored event breaks the chain. */
export interface AuditEvent {
  seq: number;
  organizationId: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  /** JSON text of the state before and after, or an empty string. Kept as text so the hash input is exact. */
  before: string;
  after: string;
  occurredAt: string;
  prevHash: string;
  hash: string;
}

export type ChainVerdict = { ok: true; count: number } | { ok: false; firstBadSeq: number; count: number };

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  from?: string;
  to?: string;
  q?: string;
}
