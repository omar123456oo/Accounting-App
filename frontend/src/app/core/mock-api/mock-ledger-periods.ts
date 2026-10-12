import { AccountingPeriod, FiscalYear, PeriodEvent } from '../../features/accounting/accounting.models';
import { Rules, validate } from './mock-clients-rules';
import { firstOfMonthAfter, endOfMonth } from './mock-clock';
import { LedgerCtx, LedgerStore } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok } from './mock-types';

const YEAR_RULES: Rules = { name: { kind: 'text', required: true }, startDate: { kind: 'date', required: true } };
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const withStatus = (store: LedgerStore, y: FiscalYear): FiscalYear => ({ ...y, status: store.periods.some((p) => p.fiscalYearId === y.id && p.status === 'open') ? 'open' : 'closed' });

export function handleYears(ctx: LedgerCtx): MockResult {
  const { req, user, store, entity } = ctx;
  if (req.method === 'GET') {
    return need(user, 'ledger.view') ?? ok({ data: store.years.filter((y) => y.ledgerEntityId === entity.id).sort((a, b) => b.startDate.localeCompare(a.startDate)).map((y) => withStatus(store, y)) });
  }
  if (req.method !== 'POST') return fail(405, 'notFound');
  const denied = need(user, 'periods.manage');
  if (denied) return denied;
  const errors = validate(req.body, YEAR_RULES, false);
  const start = text(req.body['startDate']);
  if (!errors['startDate'] && !start.endsWith('-01')) errors['startDate'] = ['startDayInvalid'];
  if (Object.keys(errors).length) return invalid(errors);
  const end = endOfMonth(firstOfMonthAfter(start, 11));
  if (store.years.some((y) => y.ledgerEntityId === entity.id && start <= y.endDate && y.startDate <= end)) return invalid({ startDate: ['periodOverlap'] });
  const year = store.createYear(entity.id, text(req.body['name']), start, user.profile.name, new Date().toISOString());
  return ok({ data: { year: withStatus(store, year), periods: store.periods.filter((p) => p.fiscalYearId === year.id) } }, 201);
}

export function handlePeriods(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  if (!id) {
    if (req.method !== 'GET') return fail(405, 'notFound');
    const rows = store.periods.filter((p) => p.ledgerEntityId === entity.id && (!req.query.get('fiscalYearId') || p.fiscalYearId === req.query.get('fiscalYearId')));
    return need(user, 'ledger.view') ?? ok({ data: structuredClone(rows.sort((a, b) => a.startDate.localeCompare(b.startDate))) });
  }
  const period = store.periods.find((p) => p.id === id && p.ledgerEntityId === entity.id);
  if (!period || req.method !== 'POST') return fail(404, 'notFound');
  switch (action) {
    case 'close':
      return need(user, 'periods.manage') ?? move(ctx, period, ['open'], 'closed', 'closed');
    case 'lock':
      return need(user, 'periods.manage') ?? move(ctx, period, ['open', 'closed'], 'locked', 'locked');
    case 'reopen':
      return need(user, 'periods.reopen') ?? reopen(ctx, period);
    default:
      return fail(404, 'notFound');
  }
}

function move(ctx: LedgerCtx, period: AccountingPeriod, from: AccountingPeriod['status'][], to: AccountingPeriod['status'], action: PeriodEvent['action']): MockResult {
  if (!from.includes(period.status)) return fail(409, 'invalidTransition');
  period.status = to;
  period.history.push({ actor: ctx.user.profile.name, action, at: new Date().toISOString() });
  return ok({ data: structuredClone(period) });
}

/** Reopening is the most sensitive period change: a separate permission and a mandatory, audited reason. */
function reopen(ctx: LedgerCtx, period: AccountingPeriod): MockResult {
  const reason = text(ctx.req.body['reason']);
  if (!reason) return invalid({ reason: ['required'] });
  if (period.status === 'open') return fail(409, 'invalidTransition');
  period.status = 'open';
  period.history.push({ actor: ctx.user.profile.name, action: 'reopened', at: new Date().toISOString(), reason });
  return ok({ data: structuredClone(period) });
}
