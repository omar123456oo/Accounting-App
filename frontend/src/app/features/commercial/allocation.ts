import { cmp, isPositive, isValidAmount, isZero, min, normalize, sub, sum } from '../../core/money/money';

export interface OpenDoc {
  id: string;
  reference: string;
  dueDate: string;
  balance: string;
}

export type RowProblem = 'invalid' | 'overDocument';

export interface AllocationRow {
  id: string;
  allocated: string;
  /** What stays open on the document after this allocation. */
  remaining: string;
  problem: RowProblem | null;
}

export interface AllocationSummary {
  rows: AllocationRow[];
  allocated: string;
  /** Capacity not allocated to any document (it becomes a credit or a prepayment). Negative when over-allocated. */
  unallocated: string;
  overCapacity: boolean;
  valid: boolean;
}

/**
 * Live totals of an allocation table, all with the money module: a row must be a positive amount of at most the
 * document's open balance, and the rows together must not exceed `capacity` (the payment amount or the unapplied credit).
 */
export function summarize(docs: readonly OpenDoc[], values: Readonly<Record<string, string>>, capacity: string): AllocationSummary {
  const rows = docs.map((d): AllocationRow => {
    const raw = (values[d.id] ?? '').trim();
    if (raw === '') return { id: d.id, allocated: '0', remaining: normalize(d.balance), problem: null };
    if (!isValidAmount(raw) || !isPositive(raw)) return { id: d.id, allocated: '0', remaining: normalize(d.balance), problem: 'invalid' };
    if (cmp(raw, d.balance) > 0) return { id: d.id, allocated: normalize(raw), remaining: normalize(sub(d.balance, raw)), problem: 'overDocument' };
    return { id: d.id, allocated: normalize(raw), remaining: normalize(sub(d.balance, raw)), problem: null };
  });
  const allocated = normalize(sum(rows.filter((r) => r.problem !== 'invalid').map((r) => r.allocated)));
  const unallocated = normalize(sub(isValidAmount(capacity) ? capacity : '0', allocated));
  const overCapacity = cmp(unallocated, '0') < 0;
  return { rows, allocated, unallocated, overCapacity, valid: !overCapacity && rows.every((r) => r.problem === null) };
}

/** Fills the oldest-due documents first until `capacity` is used up. */
export function autoAllocate(docs: readonly OpenDoc[], capacity: string): Record<string, string> {
  const out: Record<string, string> = {};
  let left = isValidAmount(capacity) ? capacity : '0';
  for (const d of [...docs].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference))) {
    if (isZero(left) || !isPositive(left)) break;
    const take = min(left, d.balance);
    if (!isPositive(take)) continue;
    out[d.id] = normalize(take);
    left = sub(left, take);
  }
  return out;
}
