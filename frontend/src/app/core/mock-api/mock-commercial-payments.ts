import { Allocation, Payment, Side } from '../../features/commercial/commercial.models';
import { add, cmp, isPositive, isValidAmount, normalize, sub, sum } from '../money/money';
import { mockToday } from './mock-clock';
import { Rules, validate } from './mock-clients-rules';
import { OpenStatus, isOpen, settle, yearLabel } from './mock-commercial-calc';
import { docEvent } from './mock-commercial-invoices';
import { canPost, linkOf, postSystemJournal, Need, requireMappings, SourceType } from './mock-commercial-posting';
import { StoredBill, StoredInvoice } from './mock-commercial-store';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { partyId: { kind: 'text', required: true }, date: { kind: 'date', required: true }, accountId: { kind: 'text', required: true } };

interface SideInfo {
  view: string;
  doc: (ctx: LedgerCtx, id: unknown) => StoredInvoice | StoredBill | undefined;
  open: OpenStatus;
  kind: 'customer' | 'supplier';
  prefix: string;
  numberType: string;
  payment: SourceType;
  allocation: SourceType;
  refund: SourceType;
}

const SIDES: Record<Side, SideInfo> = {
  ar: { view: 'invoices.view', doc: (c, id) => c.store.commercial.invoice(c.entity.id, id), open: 'issued', kind: 'customer', prefix: 'RC', numberType: 'receipt', payment: 'customer_payment', allocation: 'customer_credit_allocation', refund: 'customer_refund' },
  ap: { view: 'bills.view', doc: (c, id) => c.store.commercial.bill(c.entity.id, id), open: 'approved', kind: 'supplier', prefix: 'PV', numberType: 'payment_voucher', payment: 'supplier_payment', allocation: 'supplier_credit_allocation', refund: 'supplier_refund' },
};

const paymentDto = (ctx: LedgerCtx, p: Payment): Payment => {
  const account = ctx.store.account(p.ledgerEntityId, p.accountId);
  return structuredClone({ ...p, ...(account ? { accountCode: account.code, accountName: account.nameEn } : {}) });
};

/** Customer receipts (`payments`) and supplier payments (`bill-payments`), with allocation across documents. */
export function handlePayments(ctx: LedgerCtx, side: Side, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const info = SIDES[side];
  const mine = store.commercial.payments.filter((p) => p.ledgerEntityId === entity.id && p.side === side);
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') {
      const denied = need(user, info.view);
      if (denied) return denied;
      const rows = mine.filter((p) => !req.query.get('partyId') || p.partyId === req.query.get('partyId')).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      return paged(rows.map((p) => paymentDto(ctx, p)), pageQuery(req.query));
    }
    return req.method === 'POST' ? (need(user, 'payments.record') ?? create(ctx, side)) : fail(405, 'notFound');
  }
  const payment = mine.find((p) => p.id === id);
  if (req.method === 'GET' && !action) return need(user, info.view) ?? (payment ? ok({ data: paymentDto(ctx, payment) }) : fail(404, 'notFound'));
  if (req.method !== 'POST' || (action !== 'allocate' && action !== 'refund')) return fail(404, 'notFound');
  const denied = need(user, 'payments.record');
  if (denied) return denied;
  if (!payment) return fail(404, 'notFound');
  return action === 'allocate' ? allocateLater(ctx, side, payment) : refund(ctx, side, payment);
}

interface ResolvedAllocation {
  doc: StoredInvoice | StoredBill;
  amount: string;
}

/** Checks an allocation table: open documents of the one party, positive amounts, none above its balance. */
function resolveAllocations(ctx: LedgerCtx, side: Side, partyId: string, raw: unknown): { items: ResolvedAllocation[]; total: string } | { error: MockResult } {
  if (raw === undefined || raw === null) return { items: [], total: '0' };
  if (!Array.isArray(raw)) return { error: invalid({ allocations: ['allocationInvalid'] }) };
  const items: ResolvedAllocation[] = [];
  for (const row of raw as Array<Record<string, unknown>>) {
    const amount = text(row?.['amount']);
    const doc = SIDES[side].doc(ctx, row?.['docId']);
    if (!doc || doc.partyId !== partyId || !isOpen(doc.status) || !isValidAmount(amount) || !isPositive(amount) || items.some((i) => i.doc === doc)) return { error: invalid({ allocations: ['allocationInvalid'] }) };
    if (cmp(amount, doc.balance) > 0) return { error: invalid({ allocations: ['overAllocatedDoc'] }) };
    items.push({ doc, amount: normalize(amount) });
  }
  return { items, total: normalize(sum(items.map((i) => i.amount))) };
}

function applyAllocations(ctx: LedgerCtx, side: Side, items: readonly ResolvedAllocation[], date: string, journalId: string, link: ReturnType<typeof linkOf>): Allocation[] {
  return items.map(({ doc, amount }) => {
    doc.paid = normalize(add(doc.paid, amount));
    settle(doc, SIDES[side].open);
    doc.journals.push(link);
    doc.history.push(docEvent(ctx, side === 'ar' ? 'payment_received' : 'payment_made', amount));
    return { docId: doc.id, docReference: doc.reference, amount, date, journalId };
  });
}

function create(ctx: LedgerCtx, side: Side): MockResult {
  const { store, entity, req } = ctx;
  const info = SIDES[side];
  const c = store.commercial;
  const body = req.body;
  const errors = validate(body, RULES, false);
  const amount = text(body['amount']);
  if (!isValidAmount(amount) || !isPositive(amount)) errors['amount'] = ['amountInvalid'];
  const party = c.party(entity.id, body['partyId'], info.kind);
  if (!errors['partyId'] && !party) errors['partyId'] = ['invalidChoice'];
  const m = c.mappingsOf(entity.id);
  if (!errors['accountId'] && !m.paymentAccounts.includes(text(body['accountId']))) errors['accountId'] = ['paymentAccountInvalid'];
  if (Object.keys(errors).length || !party) return invalid(errors);
  const resolved = resolveAllocations(ctx, side, party.id, body['allocations']);
  if ('error' in resolved) return resolved.error;
  if (cmp(resolved.total, amount) > 0) return invalid({ allocations: ['overAllocatedPayment'] });
  const unapplied = normalize(sub(amount, resolved.total));
  const needs: Need[] = [];
  if (isPositive(resolved.total)) needs.push(side === 'ar' ? 'arControl' : 'apControl');
  if (isPositive(unapplied)) needs.push(side === 'ar' ? 'customerCredit' : 'supplierPrepayment');
  const missing = requireMappings(m, needs);
  if (missing) return missing;

  const date = text(body['date']);
  const bank = text(body['accountId']);
  const lines: Array<[string, string, string]> =
    side === 'ar'
      ? [[bank, amount, '0'], [m.arControl ?? '', '0', resolved.total], [m.customerCredit ?? '', '0', unapplied]]
      : [[bank, '0', amount], [m.apControl ?? '', resolved.total, '0'], [m.supplierPrepayment ?? '', unapplied, '0']];
  const live = lines.filter(([a, d, k]) => a !== '' && (isPositive(d) || isPositive(k)));
  const blocked = canPost(ctx, date, live);
  if (blocked) return blocked;

  const number = c.nextNumber(entity.id, info.numberType, yearLabel(ctx, date), info.prefix);
  const id = c.nextId('pay');
  const posted = postSystemJournal(ctx, { date, description: `${side === 'ar' ? 'Receipt' : 'Payment'} ${number} - ${party.name}`, lines: live, sourceType: info.payment, sourceId: id });
  if ('error' in posted) return posted.error;
  const payment: Payment = {
    id,
    ledgerEntityId: entity.id,
    side,
    number,
    partyId: party.id,
    partyName: party.name,
    date,
    accountId: bank,
    amount: normalize(amount),
    ...(text(body['reference']) ? { reference: text(body['reference']) } : {}),
    allocations: [],
    refunds: [],
    unapplied,
    journalId: posted.journal.id,
    createdByName: ctx.user.profile.name,
  };
  payment.allocations = applyAllocations(ctx, side, resolved.items, date, posted.journal.id, linkOf(posted.journal, 'payment'));
  c.payments.push(payment);
  return ok({ data: paymentDto(ctx, payment) }, 201);
}

/** Applies what is left of an earlier payment (a customer credit or supplier prepayment) to open documents. */
function allocateLater(ctx: LedgerCtx, side: Side, payment: Payment): MockResult {
  const body = ctx.req.body;
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const resolved = resolveAllocations(ctx, side, payment.partyId, body['allocations']);
  if ('error' in resolved) return resolved.error;
  if (resolved.items.length === 0) return invalid({ allocations: ['allocationInvalid'] });
  if (cmp(resolved.total, payment.unapplied) > 0) return invalid({ allocations: ['overAllocatedPayment'] });
  const missing = requireMappings(m, side === 'ar' ? ['arControl', 'customerCredit'] : ['apControl', 'supplierPrepayment']);
  if (missing) return missing;
  const date = text(body['date']) || mockToday();
  const lines: Array<[string, string, string]> =
    side === 'ar' ? [[m.customerCredit as string, resolved.total, '0'], [m.arControl as string, '0', resolved.total]] : [[m.apControl as string, resolved.total, '0'], [m.supplierPrepayment as string, '0', resolved.total]];
  const blocked = canPost(ctx, date, lines);
  if (blocked) return blocked;
  const posted = postSystemJournal(ctx, { date, description: `Allocation of ${payment.number} - ${payment.partyName}`, lines, sourceType: SIDES[side].allocation, sourceId: payment.id });
  if ('error' in posted) return posted.error;
  payment.allocations.push(...applyAllocations(ctx, side, resolved.items, date, posted.journal.id, linkOf(posted.journal, 'payment')));
  payment.unapplied = normalize(sub(payment.unapplied, resolved.total));
  return ok({ data: paymentDto(ctx, payment) });
}

/** Pays back (or, for a supplier, takes back) part of the unapplied balance through a bank or cash account. */
function refund(ctx: LedgerCtx, side: Side, payment: Payment): MockResult {
  const body = ctx.req.body;
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const amount = text(body['amount']);
  const accountId = text(body['accountId']);
  const errors = validate(body, { date: { kind: 'date' } }, true);
  if (!isValidAmount(amount) || !isPositive(amount)) errors['amount'] = ['amountInvalid'];
  else if (cmp(amount, payment.unapplied) > 0) errors['amount'] = ['refundExceedsCredit'];
  if (!m.paymentAccounts.includes(accountId)) errors['accountId'] = ['paymentAccountInvalid'];
  if (Object.keys(errors).length) return invalid(errors);
  const missing = requireMappings(m, [side === 'ar' ? 'customerCredit' : 'supplierPrepayment']);
  if (missing) return missing;
  const date = text(body['date']) || mockToday();
  const lines: Array<[string, string, string]> = side === 'ar' ? [[m.customerCredit as string, amount, '0'], [accountId, '0', amount]] : [[accountId, amount, '0'], [m.supplierPrepayment as string, '0', amount]];
  const blocked = canPost(ctx, date, lines);
  if (blocked) return blocked;
  const posted = postSystemJournal(ctx, { date, description: `Refund against ${payment.number} - ${payment.partyName}`, lines, sourceType: SIDES[side].refund, sourceId: payment.id });
  if ('error' in posted) return posted.error;
  payment.refunds.push({ type: 'refund', amount: normalize(amount), date, journalId: posted.journal.id, accountId });
  payment.unapplied = normalize(sub(payment.unapplied, amount));
  return ok({ data: paymentDto(ctx, payment) });
}

