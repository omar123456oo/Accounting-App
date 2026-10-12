/**
 * The mock server's business "today". Fixed so demo data (due and expiry dates) and tests are deterministic,
 * and overridable so a test can move time. A real server would use the organisation's time zone (Africa/Cairo).
 */
export const DEMO_TODAY = '2026-10-12';

let override: string | null = null;

export function setMockToday(date: string | null): void {
  override = date;
}

export function mockToday(): string {
  return override ?? DEMO_TODAY;
}

/** Adds whole days to a YYYY-MM-DD business date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pure calendar arithmetic on business dates: no time zone is involved, so the day never shifts. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The first day of the month that is `months` after the month of `date` (a YYYY-MM-DD string). */
export function firstOfMonthAfter(date: string, months: number): string {
  const index = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) + months;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

/** The last day of the month that contains `date`. */
export function endOfMonth(date: string): string {
  return `${date.slice(0, 8)}${String(lastDayOfMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)))).padStart(2, '0')}`;
}
