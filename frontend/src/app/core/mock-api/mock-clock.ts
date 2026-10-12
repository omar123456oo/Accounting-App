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
