import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { Page } from '../clients/client.models';

/** Counts rows per key. Keys that never occur are absent, so pass `keys` to keep a fixed order with zeros. */
export function countBy<T>(rows: readonly T[], key: (row: T) => string, keys: readonly string[] = []): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}

/** Ratio as a percentage, or null when there is nothing to divide by. Rounded to one decimal place. */
export function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}

/** Decimal strings are only ever turned into numbers to size a bar; every printed amount comes from the string. */
export function toNumber(amount: string): number {
  return Number(amount);
}

export const monthKey = (date: string): string => date.slice(0, 7);

/** The `count` months ending at (and including) `endMonth`, oldest first, as YYYY-MM. */
export function lastMonths(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function topN<T>(rows: readonly T[], value: (row: T) => number, n: number): T[] {
  return [...rows].sort((a, b) => value(b) - value(a)).slice(0, n);
}

/** Reads every page of a paged list API (the mock caps pages at 100 rows). */
export function fetchAll<T>(page: (n: number) => Observable<Page<T>>): Observable<T[]> {
  return page(1).pipe(
    expand((p) => (p.meta.page * p.meta.pageSize < p.meta.total ? page(p.meta.page + 1) : EMPTY)),
    map((p) => p.data),
    reduce((all, rows) => all.concat(rows), [] as T[]),
  );
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
