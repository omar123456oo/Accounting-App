import { add, mulDiv, round2, sub, sum } from '../../core/money/money';
import { addDaysIso, daysBetween } from '../analytics/analytics.helpers';

export interface OpenItem {
  dueDate: string;
  balance: string;
}

export interface ForecastInput {
  today: string;
  openingCash: string;
  receivables: readonly OpenItem[];
  payables: readonly OpenItem[];
  /** Net payroll paid once a month, or null to leave payroll out. */
  payrollMonthly: string | null;
  /** Share of each open receivable expected to be collected, 0 to 100. */
  collectionRate: number;
  /** Receivables already past due are expected this many days from today. */
  overdueDelayDays: number;
  weeks: number;
}

export interface ForecastWeek {
  start: string;
  end: string;
  inflow: string;
  outflow: string;
  net: string;
  closing: string;
}

export interface Forecast {
  weeks: ForecastWeek[];
  /** First week whose closing balance is below zero, or null. */
  shortfall: ForecastWeek | null;
  lowest: ForecastWeek;
  /** Open amounts that fall due after the horizon and so are not in any week. */
  beyondHorizon: { receivables: string; payables: string };
}

/** Day of the month on which payroll is assumed to be paid. An assumption the office should replace with its own date. */
export const PAYROLL_DAY = 28;

/**
 * A weekly cash forecast built from what is already on the books: open invoices and bills by due date, plus payroll if included.
 * Everything is a decimal string; weeks start today.
 */
export function buildForecast(i: ForecastInput): Forecast {
  const inflows = Array.from({ length: i.weeks }, () => [] as string[]);
  const outflows = Array.from({ length: i.weeks }, () => [] as string[]);
  const horizonEnd = addDaysIso(i.today, i.weeks * 7 - 1);
  const slot = (date: string): number => Math.floor(daysBetween(i.today, date) / 7);
  let lateReceivables: string[] = [];
  let latePayables: string[] = [];

  for (const r of i.receivables) {
    const expected = r.dueDate >= i.today ? r.dueDate : addDaysIso(i.today, i.overdueDelayDays);
    const amount = mulDiv(r.balance, String(i.collectionRate), '100', 2);
    if (expected > horizonEnd) lateReceivables = [...lateReceivables, amount];
    else inflows[slot(expected)].push(amount);
  }
  for (const p of i.payables) {
    const when = p.dueDate < i.today ? i.today : p.dueDate;
    if (when > horizonEnd) latePayables = [...latePayables, p.balance];
    else outflows[slot(when)].push(p.balance);
  }
  if (i.payrollMonthly !== null) {
    for (let d = i.today; d <= horizonEnd; d = addDaysIso(d, 1)) {
      if (Number(d.slice(8)) === PAYROLL_DAY) outflows[slot(d)].push(i.payrollMonthly);
    }
  }

  let balance = i.openingCash;
  const weeks = inflows.map((_, n): ForecastWeek => {
    const inflow = round2(sum(inflows[n]));
    const outflow = round2(sum(outflows[n]));
    const net = round2(sub(inflow, outflow));
    balance = round2(add(balance, net));
    const start = addDaysIso(i.today, n * 7);
    return { start, end: addDaysIso(start, 6), inflow, outflow, net, closing: balance };
  });
  return {
    weeks,
    shortfall: weeks.find((w) => Number(w.closing) < 0) ?? null,
    lowest: weeks.reduce((low, w) => (Number(w.closing) < Number(low.closing) ? w : low), weeks[0]),
    beyondHorizon: { receivables: round2(sum(lateReceivables)), payables: round2(sum(latePayables)) },
  };
}
