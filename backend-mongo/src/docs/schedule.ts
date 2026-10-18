import type { Unit } from './models.js';

export interface Offset { amount: number; unit: Unit; direction: 'before' | 'after' }
export interface RuleTiming { offsets: Offset[]; recurring?: { every?: number | null; unit?: Unit | null; max?: number | null } | null; time: string; timezone: string }
export interface Occurrence { key: string; dueAt: Date; label: string }

const MAX_RECURRENCES = 60;
export const isTimezone = (tz: string): boolean => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
export const isClock = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** Offset of `tz` from UTC at the given instant, in ms (positive east of Greenwich). */
function tzOffsetMs(utcMs: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The UTC instant at which a wall clock (date + HH:MM) shows in `tz`. Two passes settle the offset across a daylight-saving change.
 * A time skipped by a spring-forward lands just after the gap; a repeated autumn time resolves to one of its two instants, consistently.
 */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = wall - tzOffsetMs(wall, tz);
  const second = wall - tzOffsetMs(first, tz);
  // If the settled instant does not show the requested wall time, that time was skipped by a clock change: use the earlier offset, which moves it forward past the gap.
  return new Date(second + tzOffsetMs(second, tz) === wall ? second : first);
}

const dayMs = 86_400_000;
export const addDaysIso = (d: string, n: number): string => new Date(Date.parse(d + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10);

/** Calendar months, clamped to the end of a shorter month (31 Mar minus one month is 28 or 29 Feb). */
export function addMonthsIso(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))).toISOString().slice(0, 10);
}

const label = (o: Offset): string => `${o.amount} ${o.unit} ${o.direction}`;

/** Where one offset lands for a target date. Days, weeks and months move the calendar date and keep the local reminder time; minutes and hours are exact durations from the reminder time on the target date. */
export function applyOffset(targetDate: string, o: Offset, time: string, tz: string): Date {
  const n = o.direction === 'before' ? -o.amount : o.amount;
  if (o.unit === 'months') return zonedToUtc(addMonthsIso(targetDate, n), time, tz);
  if (o.unit === 'weeks') return zonedToUtc(addDaysIso(targetDate, n * 7), time, tz);
  if (o.unit === 'days') return zonedToUtc(addDaysIso(targetDate, n), time, tz);
  return new Date(zonedToUtc(targetDate, time, tz).getTime() + n * (o.unit === 'hours' ? 3_600_000 : 60_000));
}

/** `base` moved forward by `n` units of `unit`, keeping the local reminder time for calendar units. */
function later(base: Date, unit: Unit, n: number, time: string, tz: string): Date {
  if (unit === 'minutes') return new Date(base.getTime() + n * 60_000);
  if (unit === 'hours') return new Date(base.getTime() + n * 3_600_000);
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(base);
  return zonedToUtc(unit === 'months' ? addMonthsIso(local, n) : addDaysIso(local, unit === 'weeks' ? n * 7 : n), time, tz);
}

/**
 * Every send time for one rule and one target date, earliest first.
 * Recurrence repeats a reminder every N units after its first send. A "before" reminder stops before the target moment;
 * an "after" reminder stops after `max` repeats (capped at 60).
 */
export function occurrences(timing: RuleTiming, targetDate: string): Occurrence[] {
  const out: Occurrence[] = [];
  const rec = timing.recurring;
  const every = rec?.every && rec.unit && rec.every > 0 ? { amount: rec.every, unit: rec.unit } : undefined;
  const targetMoment = zonedToUtc(targetDate, timing.time, timing.timezone).getTime();
  timing.offsets.forEach((o, i) => {
    if (!(o.amount >= 0)) return;
    const base = applyOffset(targetDate, o, timing.time, timing.timezone);
    out.push({ key: `${i}`, dueAt: base, label: label(o) });
    if (!every) return;
    const cap = Math.min(rec?.max && rec.max > 0 ? rec.max : MAX_RECURRENCES, MAX_RECURRENCES);
    for (let step = 1; step <= cap; step++) {
      const at = later(base, every.unit, every.amount * step, timing.time, timing.timezone);
      if (o.direction === 'before' && at.getTime() >= targetMoment) break;
      out.push({ key: `${i}.${step}`, dueAt: at, label: `${label(o)}, repeat ${step}` });
    }
  });
  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
