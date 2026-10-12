import { add, mul, normalize, percentOf, roundTo, sub, sum } from '../../core/money/money';
import { DocLine, DocLineInput, TERMS_DAYS, TermsKind } from './commercial.models';

/**
 * Line arithmetic shared by the mock server and the editing screens (so the preview equals what is stored).
 *
 * ROUNDING RULE (documented once, used everywhere): every amount is computed per LINE and rounded half up
 * (away from zero on a tie) to 2 decimal places, the minor unit of EGP, with exact decimal arithmetic:
 *   gross          = round2(qty x unitPrice)
 *   discountAmount = round2(gross x discount% / 100)
 *   net            = gross - discountAmount
 *   taxAmount      = round2(net x taxRate% / 100)          (0 for a tax-exempt line)
 *   lineTotal      = net + taxAmount
 * Document totals are plain sums of the rounded line amounts, so the printed lines always add up to the
 * printed total. Amounts are STORED with four decimal places (NUMERIC(19,4)) and DISPLAYED with two.
 */
export interface LineAmounts {
  gross: string;
  discountAmount: string;
  net: string;
  taxAmount: string;
  total: string;
}

export function computeLine(input: Pick<DocLineInput, 'qty' | 'unitPrice' | 'discount'>, taxPercent: string | null): LineAmounts {
  const gross = roundTo(mul(input.qty, input.unitPrice), 2);
  const discountAmount = percentOf(gross, input.discount || '0', 2);
  const net = sub(gross, discountAmount);
  const taxAmount = taxPercent ? percentOf(net, taxPercent, 2) : '0.00';
  const f = (v: string) => normalize(v);
  return { gross: f(gross), discountAmount: f(discountAmount), net: f(net), taxAmount: f(taxAmount), total: f(add(net, taxAmount)) };
}

export function computeTotals(lines: ReadonlyArray<Pick<DocLine, 'net' | 'taxAmount' | 'total'>>): { net: string; taxTotal: string; total: string } {
  return { net: normalize(sum(lines.map((l) => l.net))), taxTotal: normalize(sum(lines.map((l) => l.taxAmount))), total: normalize(sum(lines.map((l) => l.total))) };
}

/** Adds whole days to a YYYY-MM-DD business date; pure calendar arithmetic, no time zone. */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function termsDaysOf(kind: TermsKind, custom: number | undefined): number {
  return kind === 'custom' ? (custom ?? 0) : TERMS_DAYS[kind];
}

export function dueDateFor(date: string, kind: TermsKind, custom: number | undefined): string {
  return addDaysIso(date, termsDaysOf(kind, custom));
}
