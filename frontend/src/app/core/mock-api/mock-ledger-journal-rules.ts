import { JournalEntry, JournalLine } from '../../features/accounting/accounting.models';
import { cmp, isPositive, isValidAmount, isZero, normalize, sub, sum } from '../money/money';
import { FieldErrors } from './mock-clients-rules';
import { MockMessageKey } from './mock-messages';
import { LedgerStore, StoredJournal, userName } from './mock-ledger-store';

/** Entries at or above this total (EGP) need an approver who also holds journals.approve_high. Configurable constant. */
export const APPROVAL_THRESHOLD = '50000.0000';

const OPTIONAL = ['description', 'costCenter', 'project', 'branch'] as const;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Structural check of the posted lines of a draft: an existing account and exactly one positive side per line. */
export function parseLines(store: LedgerStore, ledgerId: string, raw: unknown): JournalLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const lines: JournalLine[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const debit = text(item?.['debit']) || '0';
    const credit = text(item?.['credit']) || '0';
    if (!store.account(ledgerId, item?.['accountId']) || !isValidAmount(debit) || !isValidAmount(credit)) return null;
    if (isPositive(debit) === isPositive(credit)) return null;
    const line: JournalLine = { accountId: item['accountId'] as string, debit: normalize(debit), credit: normalize(credit) };
    for (const f of OPTIONAL) if (text(item[f])) line[f] = text(item[f]);
    lines.push(line);
  }
  return lines;
}

/** The rules an entry must pass to leave draft and again when it is posted. */
export function readiness(store: LedgerStore, j: Pick<StoredJournal, 'ledgerEntityId' | 'lines'>): MockMessageKey | null {
  if (j.lines.length < 2) return 'tooFewLines';
  const usable = j.lines.every((l) => {
    const a = store.account(j.ledgerEntityId, l.accountId);
    return !!a && a.isPostable && a.isActive;
  });
  if (!usable) return 'accountNotPostable';
  const debit = sum(j.lines.map((l) => l.debit));
  const credit = sum(j.lines.map((l) => l.credit));
  return cmp(debit, credit) === 0 && !isZero(debit) ? null : 'unbalanced';
}

export const linesError = (key: MockMessageKey): FieldErrors => ({ lines: [key] });

export function swapped(lines: readonly JournalLine[]): JournalLine[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

export function needsHighApproval(lines: readonly JournalLine[]): boolean {
  return cmp(sum(lines.map((l) => l.debit)), APPROVAL_THRESHOLD) >= 0;
}

export function journalDto(store: LedgerStore, j: StoredJournal): JournalEntry {
  const { draftRef, createdBy, ...rest } = j;
  return structuredClone({
    ...rest,
    reference: j.number ?? draftRef,
    createdBy,
    createdByName: userName(createdBy),
    totalDebit: sum(j.lines.map((l) => l.debit)),
    lines: j.lines.map((l) => {
      const a = store.account(j.ledgerEntityId, l.accountId);
      return { ...l, ...(a ? { accountCode: a.code, accountNameAr: a.nameAr, accountNameEn: a.nameEn } : {}) };
    }),
  }) as JournalEntry;
}

/** Net effect check used by tests and reports: debit minus credit of a line set. */
export const netOf = (lines: readonly JournalLine[]): string => sub(sum(lines.map((l) => l.debit)), sum(lines.map((l) => l.credit)));
