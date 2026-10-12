import { DocLine, DocStatus, RecognitionRow, TaxRate, TermsKind, TERMS_KINDS } from '../../features/commercial/commercial.models';
import { computeLine, computeTotals, dueDateFor, termsDaysOf } from '../../features/commercial/doc-calc';
import { add, cmp, isPositive, isValidAmount, isValidPercent, isValidQuantity, isZero, mulDiv, normalize, sub, sum } from '../money/money';
import { endOfMonth, firstOfMonthAfter, mockToday } from './mock-clock';
import { LedgerCtx } from './mock-ledger-store';
import { MockMessageKey } from './mock-messages';
import { MockResult, invalid } from './mock-types';
import { StoredInvoice } from './mock-commercial-store';
import { DemoRole, DemoUser } from './mock-users';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Reaching this total (EGP) needs approval by a second person with invoices.approve before an invoice is issued. */
export const INVOICE_APPROVAL_THRESHOLD = '100000.0000';

export type LinesOutcome = { lines: DocLine[]; usesUnverified: boolean } | { error: MockResult };
export const isError = <T extends object>(o: T | { error: MockResult }): o is { error: MockResult } => 'error' in o;

/** The reason a rate cannot be used for a document dated `date`, or null when it can. */
export function rateProblem(rate: TaxRate, date: string, allowDraft: boolean): MockMessageKey | null {
  if (rate.approvalStatus === 'retired') return 'taxRateRetired';
  if (date < rate.effectiveFrom || (rate.effectiveTo && date > rate.effectiveTo)) return 'taxRateNotEffective';
  if (rate.approvalStatus === 'draft' && !allowDraft) return 'taxRateNotApproved';
  return null;
}

/**
 * Validates the posted lines and builds stored lines: tax rate looked up, checked against the document date
 * and SNAPSHOTTED (id, code, percent, version), amounts computed with the documented rounding rule.
 */
export function buildLines(ctx: LedgerCtx, side: 'ar' | 'ap', raw: unknown, date: string): LinesOutcome {
  if (!Array.isArray(raw) || raw.length === 0) return { error: invalid({ lines: ['noLines'] }) };
  const commercial = ctx.store.commercial;
  const allowDraft = commercial.settingsOf(ctx.entity.id).allowDraftRates;
  const lines: DocLine[] = [];
  let usesUnverified = false;
  for (const item of raw as Array<Record<string, unknown>>) {
    const description = text(item?.['description']);
    const qty = text(item?.['qty']);
    const unitPrice = text(item?.['unitPrice']);
    const discount = text(item?.['discount']) || '0';
    const itemId = text(item?.[side === 'ar' ? 'serviceTypeId' : 'categoryId']);
    const service = side === 'ar' ? commercial.serviceType(ctx.entity.id, itemId) : undefined;
    const category = side === 'ap' ? commercial.category(ctx.entity.id, itemId) : undefined;
    if (!description || !isValidQuantity(qty) || !isValidAmount(unitPrice) || !isValidPercent(discount) || (!service && !category)) {
      return { error: invalid({ lines: ['lineIncomplete'] }) };
    }
    let snapshot: DocLine['tax'];
    const rateId = text(item?.['taxRateId']);
    if (rateId) {
      const rate = commercial.taxRates.find((r) => r.id === rateId);
      if (!rate) return { error: invalid({ lines: ['taxRateUnknown'] }) };
      const problem = rateProblem(rate, date, allowDraft);
      if (problem) return { error: invalid({ lines: [problem] }) };
      snapshot = { rateId: rate.id, code: rate.code, percent: rate.rate, version: rate.version, approvalStatus: rate.approvalStatus };
      if (rate.approvalStatus !== 'professionally_verified') usesUnverified = true;
    }
    const amounts = computeLine({ qty, unitPrice, discount }, snapshot?.percent ?? null);
    lines.push({
      description,
      ...(service ? { serviceTypeId: service.id, recognition: service.recognition } : { categoryId: itemId }),
      qty,
      unitPrice: normalize(unitPrice),
      discount,
      ...(snapshot ? { taxRateId: rateId, tax: snapshot } : {}),
      ...amounts,
    });
  }
  return { lines, usesUnverified };
}

export interface Terms {
  termsKind: TermsKind;
  termsDays: number;
  dueDate: string;
}

export function parseTerms(body: Record<string, unknown>, date: string): Terms | { error: MockResult } {
  const kind = text(body['termsKind']) as TermsKind;
  if (!TERMS_KINDS.includes(kind)) return { error: invalid({ termsKind: ['invalidChoice'] }) };
  const custom = body['termsDays'] === undefined || body['termsDays'] === '' ? undefined : Number(body['termsDays']);
  if (kind === 'custom' && (custom === undefined || !Number.isInteger(custom) || custom < 0 || custom > 365)) return { error: invalid({ termsDays: ['invalidNumber'] }) };
  return { termsKind: kind, termsDays: termsDaysOf(kind, custom), dueDate: dueDateFor(date, kind, custom) };
}

export function totalsOf(lines: DocLine[]): { net: string; taxTotal: string; total: string } {
  return computeTotals(lines);
}

export type OpenStatus = 'issued' | 'approved';

/** Recomputes the open balance and the settlement status after a payment or credit. */
export function settle(doc: { total: string; paid: string; credited: string; balance: string; status: DocStatus }, open: OpenStatus): void {
  doc.balance = normalize(sub(doc.total, add(doc.paid, doc.credited)));
  if (isZero(doc.balance)) doc.status = isPositive(doc.paid) ? 'paid' : 'credited';
  else doc.status = isPositive(doc.paid) ? 'partially_paid' : open;
}

export const OPEN_STATUSES: readonly DocStatus[] = ['issued', 'approved', 'partially_paid'];
export const isOpen = (status: DocStatus): boolean => OPEN_STATUSES.includes(status);

/** A document is overdue when it is open, has a balance and its due date is before the mock clock's today. */
export function effectiveStatus(doc: { status: DocStatus; dueDate: string; balance: string }, today = mockToday()): DocStatus {
  return isOpen(doc.status) && isPositive(doc.balance) && doc.dueDate < today ? 'overdue' : doc.status;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface Installment {
  n: number;
  date: string;
  /** Amount per invoice line (index-parallel; "0" for lines that are not deferred). */
  perLine: string[];
  amount: string;
}

/**
 * The installments of deferred revenue still to recognize: equal monthly amounts over the service period,
 * recognized at month end. Each step takes remaining / remaining-installments (rounded half up), so the last
 * installment absorbs any rounding and a credit note simply shrinks what is left.
 */
export function planInstallments(inv: StoredInvoice): Installment[] {
  const months = inv.servicePeriodMonths ?? 0;
  if (!inv.servicePeriodStart || months < 1) return [];
  const remaining = inv.lines.map((l) => (l.recognition === 'deferred_over_period' ? (l.deferredRemaining ?? '0') : '0'));
  const out: Installment[] = [];
  for (let n = inv.schedule.length + 1; n <= months; n++) {
    const left = months - n + 1;
    const perLine = remaining.map((rem) => (isZero(rem) ? '0' : left === 1 ? rem : mulDiv(rem, '1', String(left), 2)));
    perLine.forEach((amount, i) => (remaining[i] = sub(remaining[i], amount)));
    out.push({ n, date: endOfMonth(firstOfMonthAfter(inv.servicePeriodStart, n - 1)), perLine, amount: sum(perLine) });
  }
  return out.filter((i) => !isZero(i.amount));
}

export function scheduleOf(inv: StoredInvoice): RecognitionRow[] {
  const pending = planInstallments(inv).map((i): RecognitionRow => ({ n: i.n, date: i.date, amount: normalize(i.amount), status: 'pending' }));
  return [...inv.schedule.map((r) => ({ ...r, status: 'recognized' as const })), ...pending];
}

export interface CreditShare {
  index: number;
  net: string;
  tax: string;
}

/**
 * Spreads a credit of `amount` over the lines in proportion to what is still creditable on each line
 * (line total - credited so far). Every step rounds half up once; the last line takes the remainder, so
 * the shares add up to the credit exactly, and a credit of everything left clears each line exactly.
 */
export function splitCredit(lines: readonly DocLine[], amount: string): CreditShare[] {
  const left = lines.map((l) => sub(l.total, l.creditedTotal ?? '0'));
  const leftTax = lines.map((l, i) => sub(l.taxAmount, l.creditedTax ?? '0'));
  const capacity = sum(left);
  const lastIndex = left.map((v, i) => (isPositive(v) ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
  const shares: CreditShare[] = [];
  let given = '0';
  left.forEach((rem, index) => {
    if (!isPositive(rem) || isZero(capacity)) return;
    const share = index === lastIndex ? sub(amount, given) : mulDiv(rem, amount, capacity, 2);
    given = add(given, share);
    const tax = cmp(share, rem) === 0 ? leftTax[index] : mulDiv(share, leftTax[index], rem, 2);
    shares.push({ index, net: normalize(sub(share, tax)), tax: normalize(tax) });
  });
  return shares;
}

export function applyCredit(lines: DocLine[], shares: readonly CreditShare[]): void {
  for (const s of shares) {
    const line = lines[s.index];
    line.creditedTotal = normalize(add(line.creditedTotal ?? '0', add(s.net, s.tax)));
    line.creditedTax = normalize(add(line.creditedTax ?? '0', s.tax));
    if (line.recognition === 'deferred_over_period') line.deferredRemaining = normalize(sub(line.deferredRemaining ?? '0', s.net));
  }
}

export function yearLabel(ctx: LedgerCtx, date: string): string {
  const period = ctx.store.periodAt(ctx.entity.id, date);
  return period ? ctx.store.yearOf(period).startDate.slice(0, 4) : date.slice(0, 4);
}

export function invoiceNeedsApproval(total: string): boolean {
  return cmp(total, INVOICE_APPROVAL_THRESHOLD) >= 0;
}

/**
 * Approval limits by role (constant table, mock). The amount a role may approve on its own: null means no
 * limit. Being allowed to approve at all also needs the bills.approve permission, and never your own work.
 */
export const APPROVAL_LIMITS: Record<'bill' | 'expense_claim', Record<DemoRole, string | null>> = {
  bill: { owner: null, chief: '50000.0000', accountant: '0.0000', client: '0.0000' },
  expense_claim: { owner: null, chief: '10000.0000', accountant: '0.0000', client: '0.0000' },
};

export function withinApprovalLimit(user: DemoUser, kind: keyof typeof APPROVAL_LIMITS, amount: string): boolean {
  const limit = APPROVAL_LIMITS[kind][user.role];
  return limit === null || cmp(amount, limit) <= 0;
}
