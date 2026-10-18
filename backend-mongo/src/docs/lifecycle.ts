import type { DocStatus } from './models.js';

/** Moves a person (or the system) may make. Anything else is refused. Expiry moves are made by `evaluateStatus`, not by hand. */
export const TRANSITIONS: Record<DocStatus, readonly DocStatus[]> = {
  uploaded: ['processing', 'archived'],
  processing: ['pending_review', 'extraction_failed'],
  extraction_failed: ['processing', 'pending_review', 'archived'],
  pending_review: ['approved', 'processing', 'archived'],
  approved: ['processing', 'active', 'expiring_soon', 'expired', 'renewal_in_progress', 'pending_review', 'archived'],
  active: ['processing', 'expiring_soon', 'expired', 'renewal_in_progress', 'pending_review', 'archived'],
  expiring_soon: ['processing', 'active', 'expired', 'renewal_in_progress', 'pending_review', 'archived'],
  expired: ['processing', 'active', 'expiring_soon', 'renewal_in_progress', 'pending_review', 'archived'],
  renewal_in_progress: ['processing', 'renewed', 'active', 'expiring_soon', 'expired', 'archived'],
  renewed: ['processing', 'active', 'expiring_soon', 'expired', 'archived'],
  archived: [],
};

export const canTransition = (from: DocStatus, to: DocStatus): boolean => TRANSITIONS[from].includes(to);

/** Statuses a person may request directly through the transition endpoint. Approval, renewal and processing have their own routes. */
export const MANUAL_TARGETS: readonly DocStatus[] = ['archived'];

/** Statuses whose dates are authoritative, so expiry rules apply to them. */
export const DATED: readonly DocStatus[] = ['approved', 'active', 'expiring_soon', 'expired', 'renewed'];
/** Statuses a document must not leave through the date rules (a person is acting on it). */
export const FROZEN: readonly DocStatus[] = ['uploaded', 'processing', 'extraction_failed', 'pending_review', 'renewal_in_progress', 'archived'];

export interface EvalInput { status: DocStatus; expiryDate?: string | null; startDate?: string | null; today: string; expiringSoonDays: number }

const addDays = (d: string, n: number): string => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The status a dated document should have today. A document is expired from the day AFTER its expiry date
 * (it is still valid on the expiry date itself). Returns the current status when the date rules do not apply.
 */
export function evaluateStatus(i: EvalInput): DocStatus {
  if (!DATED.includes(i.status)) return i.status;
  if (i.expiryDate) {
    if (i.today > i.expiryDate) return 'expired';
    if (i.today >= addDays(i.expiryDate, -Math.max(0, i.expiringSoonDays))) return 'expiring_soon';
  }
  if (i.startDate && i.today < i.startDate) return 'approved';
  return 'active';
}

export const isOpenStatus = (s: DocStatus): boolean => s !== 'archived';
