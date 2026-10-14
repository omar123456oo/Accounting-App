import { PAYROLL_DAY, buildForecast } from './forecast';

const base = { today: '2026-10-12', openingCash: '10000.00', receivables: [], payables: [], payrollMonthly: null, collectionRate: 100, overdueDelayDays: 30, weeks: 13 };

describe('buildForecast', () => {
  it('starts from the opening cash and carries the balance week to week', () => {
    const f = buildForecast({ ...base, receivables: [{ dueDate: '2026-10-14', balance: '5000.00' }], payables: [{ dueDate: '2026-10-21', balance: '2000.00' }] });
    expect(f.weeks).toHaveLength(13);
    expect(f.weeks[0].start).toBe('2026-10-12');
    expect(f.weeks[0]).toMatchObject({ inflow: '5000.00', outflow: '0.00', net: '5000.00', closing: '15000.00' });
    expect(f.weeks[1]).toMatchObject({ inflow: '0.00', outflow: '2000.00', closing: '13000.00' });
    expect(f.weeks[12].closing).toBe('13000.00');
    expect(f.shortfall).toBeNull();
  });

  it('applies the collection rate with exact decimals', () => {
    const f = buildForecast({ ...base, collectionRate: 90, receivables: [{ dueDate: '2026-10-13', balance: '1000.10' }] });
    expect(f.weeks[0].inflow).toBe('900.09');
  });

  it('puts overdue receivables after the delay and overdue payables in the first week', () => {
    const f = buildForecast({ ...base, overdueDelayDays: 14, receivables: [{ dueDate: '2026-09-01', balance: '3000.00' }], payables: [{ dueDate: '2026-09-01', balance: '700.00' }] });
    expect(f.weeks[0].outflow).toBe('700.00');
    expect(f.weeks[2].inflow).toBe('3000.00'); // 14 days from today is the start of week 3
  });

  it('reports what falls beyond the horizon instead of dropping it silently', () => {
    const f = buildForecast({ ...base, receivables: [{ dueDate: '2027-06-01', balance: '800.00' }], payables: [{ dueDate: '2027-07-01', balance: '300.00' }] });
    expect(f.beyondHorizon).toEqual({ receivables: '800.00', payables: '300.00' });
    expect(f.weeks.every((w) => w.net === '0.00')).toBe(true);
  });

  it('finds the first week that goes below zero and the lowest week', () => {
    const f = buildForecast({ ...base, openingCash: '1000.00', payables: [{ dueDate: '2026-10-20', balance: '1500.00' }, { dueDate: '2026-11-10', balance: '500.00' }] });
    expect(f.shortfall?.start).toBe('2026-10-19');
    expect(f.lowest.closing).toBe('-1000.00');
  });

  it('pays payroll on the assumed day of each month inside the horizon, and only when included', () => {
    const without = buildForecast(base);
    expect(without.weeks.every((w) => w.outflow === '0.00')).toBe(true);
    const f = buildForecast({ ...base, payrollMonthly: '20000.00' });
    const paid = f.weeks.filter((w) => w.outflow === '20000.00');
    // 12 Oct + 13 weeks ends 11 Jan: the 28th of Oct, Nov, Dec fall inside.
    expect(paid).toHaveLength(3);
    expect(PAYROLL_DAY).toBe(28);
    expect(f.weeks[12].closing).toBe('-50000.00');
  });
});
