import Decimal from 'decimal.js';

/**
 * Every amount in models and API payloads is a decimal STRING (NUMERIC(19,4) semantics, at most four
 * decimal places). All arithmetic and comparison goes through this module so a JS number never touches money.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -40, toExpPos: 40 });

const AMOUNT = /^\d{1,15}(\.\d{1,4})?$/;

/** A non-negative amount with at most four decimal places, as the API stores it. */
export function isValidAmount(value: string): boolean {
  return AMOUNT.test(value);
}

export function add(a: string, b: string): string {
  return new D(a).plus(b).toFixed();
}

export function sub(a: string, b: string): string {
  return new D(a).minus(b).toFixed();
}

export function sum(values: readonly string[]): string {
  return values.reduce((total, v) => total.plus(v), new D(0)).toFixed();
}

export function neg(a: string): string {
  return new D(a).negated().toFixed();
}

export function cmp(a: string, b: string): -1 | 0 | 1 {
  return new D(a).comparedTo(b) as -1 | 0 | 1;
}

export function isZero(a: string): boolean {
  return new D(a).isZero();
}

export function isPositive(a: string): boolean {
  return new D(a).greaterThan(0);
}

export function abs(a: string): string {
  return new D(a).abs().toFixed();
}

/** Stored form: exactly four decimal places. */
export function normalize(a: string): string {
  return new D(a).toFixed(4);
}

/** Editable form: no trailing zeros and never an exponent. */
export function toPlain(a: string): string {
  return new D(a).toFixed();
}

/** Round half up to two places. For DISPLAY only, never for stored or summed values. */
export function round2(a: string): string {
  return new D(a).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Locale formatting of the rounded decimal string: Intl takes the string itself, so no digit is lost. */
export function format(a: string, locale: string): string {
  // Intl.NumberFormat v3 formats a decimal string exactly. The typings only list number | bigint.
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(a) as unknown as number);
}

/** Like `format`, but never rounds: shows every stored digit (two to four decimal places). For live totals and differences. */
export function formatExact(a: string, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(new D(a).toFixed(4) as unknown as number);
}
