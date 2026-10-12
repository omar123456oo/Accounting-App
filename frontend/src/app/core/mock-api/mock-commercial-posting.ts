import { JournalLine } from '../../features/accounting/accounting.models';
import { AccountMappings, LinkedJournal, MappingKey } from '../../features/commercial/commercial.models';
import { add, isPositive, normalize } from '../money/money';
import { event, postNow } from './mock-ledger-journals';
import { readiness } from './mock-ledger-journal-rules';
import { LedgerCtx, StoredJournal } from './mock-ledger-store';
import { MockMessageKey } from './mock-messages';
import { MockResult, invalid } from './mock-types';

export type SourceType =
  | 'invoice'
  | 'invoice_recognition'
  | 'credit_note'
  | 'customer_payment'
  | 'customer_credit_allocation'
  | 'customer_refund'
  | 'supplier_bill'
  | 'supplier_credit'
  | 'supplier_payment'
  | 'supplier_credit_allocation'
  | 'supplier_refund'
  | 'expense_claim'
  | 'expense_claim_payment';

export interface PostSpec {
  date: string;
  description: string;
  /** [accountId, debit, credit]; zero lines are dropped and lines on the same account side are merged. */
  lines: Array<[string, string, string]>;
  sourceType: SourceType;
  sourceId: string;
  /** Who approved the underlying document, when not the acting user. */
  approvedBy?: string;
}

/** Merges lines of the same account and side and drops zero lines, so a journal stays short and readable. */
export function tidyLines(lines: ReadonlyArray<[string, string, string]>): JournalLine[] {
  const out: JournalLine[] = [];
  for (const [accountId, debit, credit] of lines) {
    if (!isPositive(debit) && !isPositive(credit)) continue;
    const same = out.find((l) => l.accountId === accountId && isPositive(l.debit) === isPositive(debit));
    if (same) {
      same.debit = normalize(add(same.debit, debit));
      same.credit = normalize(add(same.credit, credit));
    } else {
      out.push({ accountId, debit: normalize(debit), credit: normalize(credit) });
    }
  }
  return out;
}

export type PostOutcome = { journal: StoredJournal } | { error: MockResult };

/**
 * Posts a system-generated journal through the SAME engine as manual entries: the period must be open, the
 * lines must balance and use postable accounts, and the gapless JE number is assigned last. The journal is
 * built but only added to the books when posting succeeds, so a failure leaves nothing behind.
 */
export function postSystemJournal(ctx: LedgerCtx, spec: PostSpec): PostOutcome {
  const lines = tidyLines(spec.lines);
  const journal: StoredJournal = {
    id: ctx.store.nextId('je'),
    ledgerEntityId: ctx.entity.id,
    draftRef: ctx.store.newDraftRef(),
    entryType: 'standard',
    postingDate: spec.date,
    description: spec.description,
    status: 'approved',
    lines,
    sourceType: spec.sourceType,
    sourceId: spec.sourceId,
    createdBy: ctx.user.profile.id,
    approvedBy: spec.approvedBy ?? ctx.user.profile.id,
    history: [event(ctx, 'created', spec.sourceType)],
  };
  const failed = postNow(ctx, journal);
  if (failed) return { error: failed };
  ctx.store.journals.push(journal);
  return { journal };
}

/** Dry run of the posting rules for a date and lines, so a multi-step action can be refused before anything changes. */
export function canPost(ctx: LedgerCtx, date: string, lines: ReadonlyArray<[string, string, string]>): MockResult | null {
  const period = ctx.store.periodAt(ctx.entity.id, date);
  if (!period || period.status !== 'open') return invalid({ postingDate: ['periodNotOpen'] });
  const probe: StoredJournal = {
    id: 'probe',
    ledgerEntityId: ctx.entity.id,
    draftRef: 'probe',
    entryType: 'standard',
    postingDate: date,
    description: '',
    status: 'approved',
    lines: tidyLines(lines),
    createdBy: ctx.user.profile.id,
    history: [],
  };
  const problem = readiness(ctx.store, probe);
  return problem ? invalid({ lines: [problem] }) : null;
}

export function linkOf(j: StoredJournal, kind: string): LinkedJournal {
  return { journalId: j.id, ...(j.number ? { number: j.number } : {}), kind, date: j.postingDate };
}

/** Fails with 422 `mappingMissing:<key>` naming the first account mapping the posting needs but the ledger lacks. */
export type Need = MappingKey | { service: string } | { category: string };

export function requireMappings(m: AccountMappings, needs: readonly Need[]): MockResult | null {
  for (const need of needs) {
    let missing: string | null = null;
    if (typeof need === 'string') missing = m[need] ? null : need;
    else if ('service' in need) missing = m.revenueByService[need.service] ? null : 'revenue';
    else missing = m.expenseByCategory[need.category] ? null : 'expense';
    if (missing) return invalid({ mappings: [`mappingMissing:${missing}` as MockMessageKey] });
  }
  return null;
}
