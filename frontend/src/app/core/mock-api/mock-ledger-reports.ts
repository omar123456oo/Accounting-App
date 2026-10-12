import { GeneralLedgerReport, GlRow, JournalRegisterReport, TbRow, TrialBalanceReport } from '../../features/accounting/accounting.models';
import { add, cmp, isPositive, neg, sub, sum } from '../money/money';
import { Rules, validate } from './mock-clients-rules';
import { LedgerCtx, StoredJournal, isPosted, userName } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok } from './mock-types';

const RANGE: Rules = { from: { kind: 'date' }, to: { kind: 'date' } };

/**
 * Reports read ONLY posted lines (a reversed entry was posted, and its reversal nets it out). With
 * includeUnposted=true draft, pending and approved entries are added as a preview and the response says so.
 */
export function handleReports(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const denied = need(user, 'reports.view');
  if (denied) return denied;
  if (req.method !== 'GET') return fail(405, 'notFound');
  const q = req.query;
  const range = { from: q.get('from') ?? '', to: q.get('to') ?? '' };
  const errors = validate(range, RANGE, true);
  if (Object.keys(errors).length) return invalid(errors);
  const includesUnposted = q.get('includeUnposted') === 'true';
  const entries = store.journals.filter((j) => j.ledgerEntityId === entity.id && (includesUnposted || isPosted(j)));
  switch (rest[0]) {
    case 'general-ledger':
      return generalLedger(ctx, entries, range, q.get('accountId'), includesUnposted);
    case 'trial-balance':
      return ok({ data: trialBalance(ctx, entries, range, includesUnposted) });
    case 'journal-register':
      return ok({ data: register(ctx, entries, range, includesUnposted) });
    default:
      return fail(404, 'notFound');
  }
}

const inRange = (date: string, r: { from: string; to: string }): boolean => (!r.from || date >= r.from) && (!r.to || date <= r.to);
const before = (date: string, r: { from: string }): boolean => !!r.from && date < r.from;
const net = (l: { debit: string; credit: string }): string => sub(l.debit, l.credit);

function generalLedger(ctx: LedgerCtx, entries: StoredJournal[], r: { from: string; to: string }, accountId: string | null, includesUnposted: boolean): MockResult {
  if (!accountId) return invalid({ accountId: ['required'] });
  const account = ctx.store.account(ctx.entity.id, accountId);
  if (!account) return fail(404, 'notFound');
  const lines = entries
    .slice()
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate))
    .flatMap((j) => j.lines.filter((l) => l.accountId === accountId).map((l) => ({ j, l })));
  const opening = sum(lines.filter(({ j }) => before(j.postingDate, r)).map(({ l }) => net(l)));
  let running = opening;
  const rows: GlRow[] = lines
    .filter(({ j }) => inRange(j.postingDate, r))
    .map(({ j, l }) => {
      running = add(running, net(l));
      return { date: j.postingDate, journalId: j.id, reference: j.number ?? j.draftRef, description: l.description ?? j.description, status: j.status, debit: l.debit, credit: l.credit, balance: running };
    });
  const { id, code, nameAr, nameEn, normalBalance } = account;
  const report: GeneralLedgerReport = {
    includesUnposted,
    account: { id, code, nameAr, nameEn, normalBalance },
    openingBalance: opening,
    rows,
    totalDebit: sum(rows.map((x) => x.debit)),
    totalCredit: sum(rows.map((x) => x.credit)),
    closingBalance: running,
  };
  return ok({ data: report });
}

function trialBalance(ctx: LedgerCtx, entries: StoredJournal[], r: { from: string; to: string }, includesUnposted: boolean): TrialBalanceReport {
  const rows: TbRow[] = [];
  for (const account of ctx.store.accountsOf(ctx.entity.id).sort((a, b) => a.code.localeCompare(b.code))) {
    const lines = entries.filter((j) => !r.to || j.postingDate <= r.to).flatMap((j) => j.lines.filter((l) => l.accountId === account.id).map((l) => ({ date: j.postingDate, l })));
    if (lines.length === 0) continue;
    const opening = sum(lines.filter((x) => before(x.date, r)).map((x) => net(x.l)));
    const moved = lines.filter((x) => inRange(x.date, r)).map((x) => x.l);
    const debit = sum(moved.map((l) => l.debit));
    const credit = sum(moved.map((l) => l.credit));
    const closing = add(opening, sub(debit, credit));
    rows.push({
      accountId: account.id,
      code: account.code,
      nameAr: account.nameAr,
      nameEn: account.nameEn,
      opening,
      debit,
      credit,
      closingDebit: isPositive(closing) ? closing : '0',
      closingCredit: cmp(closing, '0') < 0 ? neg(closing) : '0',
    });
  }
  const totals = { debit: sum(rows.map((x) => x.debit)), credit: sum(rows.map((x) => x.credit)), closingDebit: sum(rows.map((x) => x.closingDebit)), closingCredit: sum(rows.map((x) => x.closingCredit)) };
  const balanced = cmp(totals.debit, totals.credit) === 0 && cmp(totals.closingDebit, totals.closingCredit) === 0;
  return { includesUnposted, rows, totals, balanced, difference: sub(totals.closingDebit, totals.closingCredit) };
}

function register(ctx: LedgerCtx, entries: StoredJournal[], r: { from: string; to: string }, includesUnposted: boolean): JournalRegisterReport {
  const rows = entries
    .filter((j) => inRange(j.postingDate, r))
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate))
    .map((j) => ({ id: j.id, reference: j.number ?? j.draftRef, postingDate: j.postingDate, description: j.description, status: j.status, entryType: j.entryType, totalDebit: ctx.store.totalDebit(j.lines), createdByName: userName(j.createdBy) }));
  return { includesUnposted, rows, total: sum(rows.map((x) => x.totalDebit)) };
}
