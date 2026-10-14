import { addDays } from './common.js';

/** Allowed employee status moves. Anything else is rejected; "terminated -> active" only happens through rehire. */
export const EMPLOYEE_TRANSITIONS: Record<string, readonly string[]> = {
  active: ['inactive', 'terminated', 'archived'],
  inactive: ['active', 'terminated', 'archived'],
  terminated: ['archived'],
  archived: [],
};
export const canMove = (from: string, to: string): boolean => EMPLOYEE_TRANSITIONS[from]?.includes(to) ?? false;

/**
 * True when pointing `node` at `newParent` would create a loop (or a self-reference).
 * `parentOf` returns the current parent id of any id, or null at the top.
 */
export async function wouldCycle(node: string, newParent: string | null, parentOf: (id: string) => Promise<string | null>): Promise<boolean> {
  const seen = new Set<string>();
  for (let cur: string | null = newParent; cur; cur = await parentOf(cur)) {
    if (cur === node || seen.has(cur)) return true;
    seen.add(cur);
  }
  return false;
}

export interface Range { start: string; end?: string | null }
/** Closed date ranges; a missing end means "no end". */
export const overlaps = (a: Range, b: Range): boolean => (!a.end || b.start <= a.end) && (!b.end || a.start <= b.end);

/** A renewal must start the day after the contract it renews ends, so cover is continuous and nothing overlaps. */
export const renewalStart = (previousEnd: string): string => addDays(previousEnd, 1);

export const CONTRACT_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['active'],
  active: ['renewed', 'expired', 'terminated'],
  renewed: [],
  expired: [],
  terminated: [],
};
export const canMoveContract = (from: string, to: string): boolean => CONTRACT_TRANSITIONS[from]?.includes(to) ?? false;
