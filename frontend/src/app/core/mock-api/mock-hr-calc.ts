import { HrSettings, PayComponent, PayrollRun, PayrollSlip } from '../../features/hr/hr.models';
import { add, mulDiv, round2, sub, sum } from '../money/money';
import { addDays, endOfMonth } from './mock-clock';

const dayOfWeek = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Working days in [from, to]: weekend days and listed holidays do not count. */
export function workingDays(from: string, to: string, settings: HrSettings): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!settings.weekendDays.includes(dayOfWeek(d)) && !settings.holidays.includes(d)) n++;
  }
  return n;
}

/** The part of [from, to] that falls inside a month (YYYY-MM), as working days. */
export function workingDaysInMonth(from: string, to: string, month: string, settings: HrSettings): number {
  const start = from > `${month}-01` ? from : `${month}-01`;
  const monthEnd = endOfMonth(`${month}-01`);
  const end = to < monthEnd ? to : monthEnd;
  return start > end ? 0 : workingDays(start, end, settings);
}

const kindSum = (components: PayComponent[], kind: PayComponent['kind']): string => sum(components.filter((c) => c.kind === kind).map((c) => c.amount));

export interface SlipInput {
  userId: string;
  name: string;
  month: string;
  baseSalary: string;
  components: PayComponent[];
  unpaidLeaveDays: number;
}

/**
 * Gross = base + allowances. Deductions = the listed deductions + unpaid leave (base / divisor per day).
 * Income tax and social insurance are NOT calculated here: enter them as deductions once the office has confirmed the rules.
 */
export function buildSlip(i: SlipInput, settings: HrSettings): PayrollSlip {
  const allowances = i.components.filter((c) => c.kind === 'allowance');
  const deductions = i.components.filter((c) => c.kind === 'deduction');
  const unpaid = i.unpaidLeaveDays > 0 ? mulDiv(i.baseSalary, String(i.unpaidLeaveDays), String(settings.unpaidLeaveDivisor), 2) : '0.00';
  const gross = round2(add(i.baseSalary, kindSum(i.components, 'allowance')));
  const totalDeductions = round2(add(kindSum(i.components, 'deduction'), unpaid));
  return {
    userId: i.userId,
    name: i.name,
    month: i.month,
    baseSalary: i.baseSalary,
    allowances,
    deductions,
    unpaidLeaveDays: i.unpaidLeaveDays,
    unpaidLeaveDeduction: unpaid,
    gross,
    totalDeductions,
    net: round2(sub(gross, totalDeductions)),
  };
}

export function totalsOf(slips: PayrollSlip[]): PayrollRun['totals'] {
  const gross = round2(sum(slips.map((s) => s.gross)));
  const deductions = round2(sum(slips.map((s) => s.totalDeductions)));
  return { gross, deductions, net: round2(sub(gross, deductions)) };
}
