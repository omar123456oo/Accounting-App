import { WithholdingRecord } from '../../features/tax/tax.models';
import { isPositive, isValidAmount, isValidPercent, mulDiv, normalize, sum } from '../money/money';
import { Rules, validate } from './mock-clients-rules';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { date: { kind: 'date', required: true }, direction: { kind: ['deducted_by_us', 'deducted_by_customer'], required: true }, counterparty: { kind: 'text', required: true } };

/**
 * Withholding records are entered by a person (the rate is part of the entry, never seeded) and may point at a
 * customer receipt or supplier payment of the same ledger. The totals per period are what a withholding return shows.
 */
export function handleWithholding(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  if (rest.length > 0) return fail(404, 'notFound');
  const mine = store.compliance.withholding.filter((w) => w.ledgerEntityId === entity.id);
  if (req.method === 'GET') {
    const denied = need(user, 'tax.view');
    if (denied) return denied;
    const from = req.query.get('from') ?? '';
    const to = req.query.get('to') ?? '';
    const rows = mine.filter((w) => (!from || w.date >= from) && (!to || w.date <= to)).sort((a, b) => b.date.localeCompare(a.date));
    const by = (d: string) => sum(rows.filter((w) => w.direction === d).map((w) => w.amount));
    return ok({ data: structuredClone(rows), meta: { totals: { deductedByUs: by('deducted_by_us'), deductedByCustomer: by('deducted_by_customer'), count: rows.length } } });
  }
  if (req.method !== 'POST') return fail(405, 'notFound');
  const denied = need(user, 'tax.prepare');
  if (denied) return denied;
  const body = req.body;
  const errors = validate(body, RULES, false);
  const base = text(body['baseAmount']);
  const rate = text(body['ratePercent']);
  if (!isValidAmount(base) || !isPositive(base)) errors['baseAmount'] = ['amountInvalid'];
  if (!isValidPercent(rate) || !isPositive(rate)) errors['ratePercent'] = ['taxRateInvalid'];
  const paymentId = text(body['paymentId']);
  const payment = paymentId ? store.commercial.payment(entity.id, paymentId) : undefined;
  if (paymentId && !payment) errors['paymentId'] = ['invalidChoice'];
  if (Object.keys(errors).length) return invalid(errors);
  const rec: WithholdingRecord = {
    id: store.compliance.nextId('wht'),
    ledgerEntityId: entity.id,
    date: text(body['date']),
    direction: body['direction'] as WithholdingRecord['direction'],
    counterparty: text(body['counterparty']),
    ...(payment ? { paymentId: payment.id, paymentNumber: payment.number } : {}),
    baseAmount: normalize(base),
    ratePercent: rate,
    amount: normalize(mulDiv(base, rate, '100', 4)),
    ...(text(body['certificateNo']) ? { certificateNo: text(body['certificateNo']) } : {}),
    ...(text(body['note']) ? { note: text(body['note']) } : {}),
    createdByName: user.profile.name,
  };
  store.compliance.withholding.push(rec);
  store.compliance.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'tax.withholding_recorded', entityType: 'withholding', entityId: rec.id, after: rec });
  return ok({ data: structuredClone(rec) }, 201);
}
