import { of } from 'rxjs';
import { Page } from '../clients/client.models';
import { addDaysIso, countBy, daysBetween, fetchAll, lastMonths, pct, topN } from './analytics.helpers';

describe('analytics helpers', () => {
  it('counts per key and keeps the requested keys at zero', () => {
    expect(countBy(['a', 'b', 'a'], (x) => x, ['a', 'b', 'c'])).toEqual({ a: 2, b: 1, c: 0 });
    expect(countBy(['x'], (x) => x)).toEqual({ x: 1 });
  });

  it('gives a percentage rounded to one decimal, and null when there is nothing to divide by', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(5, 0)).toBeNull();
    expect(pct(0, 4)).toBe(0);
  });

  it('lists the last months across a year boundary, oldest first', () => {
    expect(lastMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastMonths('2026-10', 1)).toEqual(['2026-10']);
  });

  it('does calendar arithmetic without time zones', () => {
    expect(daysBetween('2026-10-01', '2026-10-12')).toBe(11);
    expect(daysBetween('2026-10-12', '2026-10-01')).toBe(-11);
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('takes the largest n without changing the input', () => {
    const rows = [3, 9, 1, 7];
    expect(topN(rows, (x) => x, 2)).toEqual([9, 7]);
    expect(rows).toEqual([3, 9, 1, 7]);
  });

  it('reads every page of a paged list', async () => {
    const pages = (n: number) => of<Page<number>>({ data: n === 3 ? [5] : [n * 10, n * 10 + 1], meta: { page: n, pageSize: 2, total: 5 } });
    let all: number[] = [];
    fetchAll(pages).subscribe((r) => (all = r));
    expect(all).toEqual([10, 11, 20, 21, 5]);
  });

  it('stops after a single page', () => {
    let all: number[] = [];
    fetchAll(() => of<Page<number>>({ data: [1], meta: { page: 1, pageSize: 100, total: 1 } })).subscribe((r) => (all = r));
    expect(all).toEqual([1]);
  });
});
