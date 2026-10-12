import { AGING_BUCKETS, AgingBucket, AgingBuckets, AgingReport, AgingRow, BudgetReport, CommercialSummary, ReconciliationReport, ReconciliationRow, RevenueBy, RevenueReport, RevenueRow, ScheduleItem, Side, Statement, StatementLine } from '../../features/commercial/commercial.models';
import { addDaysIso } from '../../features/commercial/doc-calc';
import { add, cmp, isPositive, isZero, neg, normalize, sub, sum } from '../money/money';
import { mockToday } from './mock-clock';
import { Rules, validate } from './mock-clients-rules';
import { daysBetween, effectiveStatus, isOpen } from './mock-commercial-calc';
import { needAny } from './mock-commercial-settings';
import { LedgerCtx, LedgerStore, isPosted } from './mock-ledger-store';
import { MockResult, fail, invalid, ok } from './mock-types';
import { DemoUser } from './mock-users';

const DATE: Rules = { from: { kind: 'date' }, to: { kind: 'date' }, asOf: { kind: 'date' } };
const VIEW = ['invoices.view', 'bills.view'];

const bucketOf = (days: number): AgingBucket => (days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus');
const emptyBuckets = (): AgingBuckets => ({ current: '0', d1_30: '0', d31_60: '0', d61_90: '0', d90_plus: '0', total: '0' });

/** Net balance (debit minus credit) of an account over all posted journals. */
export function accountNet(store: LedgerStore, ledgerId: string, accountId: string, upTo?: string): string {
  return sum(store.journals.filter((j) => j.ledgerEntityId === ledgerId && isPosted(j) && (!upTo || j.postingDate <= upTo)).flatMap((j) => j.lines.filter((l) => l.accountId === accountId).map((l) => sub(l.debit, l.credit))));
}

export function handleCommercialReports(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user } = ctx;
  if (req.method !== 'GET') return fail(405, 'notFound');
  const denied = needAny(user, VIEW);
  if (denied) return denied;
  const range = { from: req.query.get('from') ?? '', to: req.query.get('to') ?? '', asOf: req.query.get('asOf') ?? '' };
  const errors = validate(range, DATE, true);
  if (Object.keys(errors).length) return invalid(errors);
  const sideNeed = (side: Side) => needAny(user, [side === 'ar' ? 'invoices.view' : 'bills.view']);
  switch (rest[0]) {
    case 'aging': {
      const side: Side = req.query.get('side') === 'ap' ? 'ap' : 'ar';
      return sideNeed(side) ?? ok({ data: aging(ctx, side, range.asOf || mockToday()) });
    }
    case 'statement': {
      const side: Side = req.query.get('side') === 'ap' ? 'ap' : 'ar';
      return sideNeed(side) ?? statement(ctx, side, req.query.get('partyId') ?? '', range.from, range.to || mockToday());
    }
    case 'revenue': {
      const by = req.query.get('by') as RevenueBy;
      return !['client', 'service', 'month'].includes(by) ? invalid({ by: ['invalidChoice'] }) : (sideNeed('ar') ?? ok({ data: revenue(ctx, by, range.from, range.to) }));
    }
    case 'reconciliation':
      return ok({ data: reconciliation(ctx) });
    case 'budget':
      return sideNeed('ap') ?? ok({ data: budget(ctx, req.query.get('month') || mockToday().slice(0, 7)) });
    case 'payment-schedule':
      return sideNeed('ap') ?? ok({ data: schedule(ctx, Number(req.query.get('days')) || 30) });
    default:
      return fail(404, 'notFound');
  }
}

export function aging(ctx: LedgerCtx, side: Side, asOf: string): AgingReport {
  const c = ctx.store.commercial;
  const docs = (side === 'ar' ? c.invoices : c.bills).filter((d) => d.ledgerEntityId === ctx.entity.id && isOpen(d.status) && isPositive(d.balance));
  const rows = new Map<string, AgingRow>();
  const totals = emptyBuckets();
  for (const d of docs.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const days = daysBetween(d.dueDate, asOf);
    const bucket = bucketOf(days);
    let row = rows.get(d.partyId);
    if (!row) {
      row = { partyId: d.partyId, partyName: d.partyName, ...emptyBuckets(), items: [] };
      rows.set(d.partyId, row);
    }
    row[bucket] = normalize(add(row[bucket], d.balance));
    row.total = normalize(add(row.total, d.balance));
    totals[bucket] = normalize(add(totals[bucket], d.balance));
    totals.total = normalize(add(totals.total, d.balance));
    row.items.push({ docId: d.id, reference: d.reference, date: d.date, dueDate: d.dueDate, daysPastDue: Math.max(0, days), bucket, balance: d.balance });
  }
  for (const b of AGING_BUCKETS) totals[b] = normalize(totals[b]);
  return { side, asOf, rows: [...rows.values()].sort((a, b) => a.partyName.localeCompare(b.partyName)), totals };
}

function statement(ctx: LedgerCtx, side: Side, partyId: string, from: string, to: string): MockResult {
  const c = ctx.store.commercial;
  const party = c.party(ctx.entity.id, partyId, side === 'ar' ? 'customer' : 'supplier');
  if (!party) return fail(404, 'notFound');
  // AR: customer owes (debit positive). AP: we owe the supplier, so bills are credits and payments debits.
  const raw: Array<Omit<StatementLine, 'balance'>> = [];
  const docs = side === 'ar' ? c.invoices : c.bills;
  for (const d of docs.filter((x) => x.ledgerEntityId === ctx.entity.id && x.partyId === partyId && x.number)) {
    raw.push({ date: d.date, kind: side === 'ar' ? 'invoice' : 'bill', reference: d.reference, description: d.notes ?? '', debit: side === 'ar' ? d.total : '0', credit: side === 'ar' ? '0' : d.total });
  }
  for (const n of c.creditNotes.filter((x) => x.ledgerEntityId === ctx.entity.id && x.side === side && x.partyId === partyId)) {
    raw.push({ date: n.date, kind: 'credit_note', reference: n.number, description: n.reason, debit: side === 'ar' ? '0' : n.amount, credit: side === 'ar' ? n.amount : '0' });
  }
  for (const p of c.payments.filter((x) => x.ledgerEntityId === ctx.entity.id && x.side === side && x.partyId === partyId)) {
    raw.push({ date: p.date, kind: 'payment', reference: p.number, description: p.reference ?? '', debit: side === 'ar' ? '0' : p.amount, credit: side === 'ar' ? p.amount : '0' });
    for (const r of p.refunds) raw.push({ date: r.date, kind: 'refund', reference: p.number, description: '', debit: side === 'ar' ? r.amount : '0', credit: side === 'ar' ? '0' : r.amount });
  }
  raw.sort((a, b) => a.date.localeCompare(b.date));
  const delta = (l: Pick<StatementLine, 'debit' | 'credit'>) => (side === 'ar' ? sub(l.debit, l.credit) : sub(l.credit, l.debit));
  const opening = sum(raw.filter((l) => from && l.date < from).map(delta));
  let running = opening;
  const lines = raw
    .filter((l) => (!from || l.date >= from) && l.date <= to)
    .map((l): StatementLine => {
      running = add(running, delta(l));
      return { ...l, debit: normalize(l.debit), credit: normalize(l.credit), balance: normalize(running) };
    });
  const unapplied = sum(c.payments.filter((p) => p.ledgerEntityId === ctx.entity.id && p.side === side && p.partyId === partyId).map((p) => p.unapplied));
  const report: Statement = {
    side,
    party: { id: party.id, name: party.name, ...(party.taxRegistrationNo ? { taxRegistrationNo: party.taxRegistrationNo } : {}) },
    from,
    to,
    openingBalance: normalize(opening),
    lines,
    closingBalance: normalize(running),
    unapplied: normalize(unapplied),
  };
  return ok({ data: report });
}

/** Revenue as booked by posted invoice journals: on-issue revenue at issue, deferred revenue as recognized, less credit notes. */
function revenue(ctx: LedgerCtx, by: RevenueBy, from: string, to: string): RevenueReport {
  const c = ctx.store.commercial;
  const totals = new Map<string, RevenueRow>();
  for (const inv of c.invoices.filter((i) => i.ledgerEntityId === ctx.entity.id && i.number)) {
    for (const e of inv.revenueEvents.filter((x) => (!from || x.date >= from) && (!to || x.date <= to))) {
      const service = c.serviceType(ctx.entity.id, e.serviceTypeId);
      const [key, label, labelAr] = by === 'client' ? [inv.partyId, inv.partyName, undefined] : by === 'service' ? [e.serviceTypeId, service?.nameEn ?? e.serviceTypeId, service?.nameAr] : [e.date.slice(0, 7), e.date.slice(0, 7), undefined];
      const row = totals.get(key) ?? { key, label, ...(labelAr ? { labelAr } : {}), amount: '0' };
      row.amount = normalize(add(row.amount, e.amount));
      totals.set(key, row);
    }
  }
  const rows = [...totals.values()].sort((a, b) => (by === 'month' ? a.key.localeCompare(b.key) : cmp(b.amount, a.amount) || a.label.localeCompare(b.label)));
  return { by, from, to, rows, total: normalize(sum(rows.map((r) => r.amount))) };
}

/** Subledgers are the current state of the documents, so the control accounts are read as they stand now: every posted journal, whatever its date. */
export function reconciliation(ctx: LedgerCtx): ReconciliationReport {
  const { store, entity } = ctx;
  const c = store.commercial;
  const m = c.mappingsOf(entity.id);
  const mine = <T extends { ledgerEntityId: string }>(rows: T[]) => rows.filter((r) => r.ledgerEntityId === entity.id);
  const spec: Array<[ReconciliationRow['key'], ReconciliationRow['mapping'], string, 'debit' | 'credit']> = [
    ['ar', 'arControl', sum(mine(c.invoices).filter((i) => isOpen(i.status)).map((i) => i.balance)), 'debit'],
    ['ap', 'apControl', sum(mine(c.bills).filter((b) => isOpen(b.status)).map((b) => b.balance)), 'credit'],
    ['customerCredit', 'customerCredit', sum(mine(c.payments).filter((p) => p.side === 'ar').map((p) => p.unapplied)), 'credit'],
    ['supplierPrepayment', 'supplierPrepayment', sum(mine(c.payments).filter((p) => p.side === 'ap').map((p) => p.unapplied)), 'debit'],
    ['deferredRevenue', 'deferredRevenue', sum(mine(c.invoices).filter((i) => i.number).flatMap((i) => i.lines.map((l) => l.deferredRemaining ?? '0'))), 'credit'],
  ];
  const rows = spec.map(([key, mapping, subledger, normal]): ReconciliationRow => {
    const accountId = m[mapping];
    const account = accountId ? store.account(entity.id, accountId) : undefined;
    const net = accountId ? accountNet(store, entity.id, accountId) : '0';
    const control = normalize(normal === 'debit' ? net : neg(net));
    const difference = normalize(sub(subledger, control));
    const unmapped = !account;
    return { key, mapping, ...(account ? { accountId: account.id, accountCode: account.code } : {}), subledger: normalize(subledger), control, difference, unmapped, reconciled: unmapped ? isZero(subledger) : isZero(difference) };
  });
  return { asOf: mockToday(), rows, reconciled: rows.every((r) => r.reconciled) };
}

function budget(ctx: LedgerCtx, month: string): BudgetReport {
  const { store, entity } = ctx;
  const c = store.commercial;
  const m = c.mappingsOf(entity.id);
  const rows = c.categories
    .filter((cat) => cat.ledgerEntityId === entity.id)
    .map((cat) => {
      const accountId = m.expenseByCategory[cat.id];
      const lines = accountId ? store.journals.filter((j) => j.ledgerEntityId === entity.id && isPosted(j) && j.postingDate.startsWith(month)).flatMap((j) => j.lines.filter((l) => l.accountId === accountId)) : [];
      const actual = normalize(sum(lines.map((l) => sub(l.debit, l.credit))));
      const over = !!cat.monthlyBudget && cmp(actual, cat.monthlyBudget) > 0;
      return { categoryId: cat.id, code: cat.code, nameAr: cat.nameAr, nameEn: cat.nameEn, ...(cat.monthlyBudget ? { budget: cat.monthlyBudget, remaining: normalize(sub(cat.monthlyBudget, actual)) } : {}), actual, over };
    });
  return { month, rows };
}

function schedule(ctx: LedgerCtx, days: number): ScheduleItem[] {
  const today = mockToday();
  const horizon = addDaysIso(today, days);
  return ctx.store.commercial.bills
    .filter((b) => b.ledgerEntityId === ctx.entity.id && isOpen(b.status) && isPositive(b.balance) && b.dueDate <= horizon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((b) => ({ docId: b.id, reference: b.reference, supplierId: b.partyId, partyName: b.partyName, dueDate: b.dueDate, balance: b.balance, bucket: b.dueDate < today ? ('overdue' as const) : b.dueDate <= addDaysIso(today, 7) ? ('this_week' as const) : ('later' as const) }));
}

/** Dashboard numbers for each ledger the caller may see: only the parts their permissions allow. */
export function commercialSummary(ledgers: Array<{ ctx: LedgerCtx; type: 'firm' | 'client'; name: string }>, user: DemoUser): CommercialSummary {
  const canAr = user.profile.permissions.includes('invoices.view');
  const canAp = user.profile.permissions.includes('bills.view');
  const today = mockToday();
  const rows = ledgers.map(({ ctx, type, name }) => {
    const c = ctx.store.commercial;
    const invoices = c.invoices.filter((i) => i.ledgerEntityId === ctx.entity.id && isOpen(i.status) && isPositive(i.balance));
    const due = c.bills.filter((b) => b.ledgerEntityId === ctx.entity.id && isOpen(b.status) && isPositive(b.balance) && b.dueDate >= today && b.dueDate <= addDaysIso(today, 7));
    return {
      ledgerEntityId: ctx.entity.id,
      type,
      name,
      ...(canAr ? { outstandingReceivables: normalize(sum(invoices.map((i) => i.balance))), overdueInvoices: invoices.filter((i) => effectiveStatus(i) === 'overdue').length } : {}),
      ...(canAp ? { billsDueSoon: due.length, billsDueSoonAmount: normalize(sum(due.map((b) => b.balance))) } : {}),
    };
  });
  return {
    ledgers: rows,
    ...(canAr ? { overdueInvoices: rows.reduce((n, r) => n + (r.overdueInvoices ?? 0), 0) } : {}),
    ...(canAp ? { billsDueSoon: rows.reduce((n, r) => n + (r.billsDueSoon ?? 0), 0) } : {}),
  };
}

