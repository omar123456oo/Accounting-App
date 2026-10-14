import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';

const BASE = '/api/v1/staff/hr';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock HR API', () => {
  let http: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });

  async function call(method: string, path: string, body?: unknown): Promise<Res> {
    try {
      const res = await firstValueFrom(http.request(method, `${BASE}/${path}`, { body, observe: 'response' }));
      return { status: res.status, body: res.body };
    } catch (e) {
      const err = e as HttpErrorResponse;
      return { status: err.status, body: err.error };
    }
  }
  const apply = (extra: object) => call('POST', 'leave', { typeId: 'lt-annual', reason: 'x', ...extra });

  describe('files and salaries', () => {
    it('keeps the staff list and other people\'s salaries from ordinary staff', async () => {
      await signInDemo('accountant@demo.test');
      expect((await call('GET', 'employees')).status).toBe(403);
      expect((await call('GET', 'employees/u-accountant')).status).toBe(200);
      expect((await call('GET', 'employees/u-owner')).status).toBe(403);
      expect((await call('GET', 'employees/u-accountant/salary')).status).toBe(200);
      expect((await call('GET', 'employees/u-owner/salary')).status).toBe(403);
      expect((await call('PUT', 'employees/u-accountant/salary', { baseSalary: '99999.00', effectiveFrom: '2026-10-01', components: [] })).status).toBe(403);
    });

    it('lets the owner list, edit and see the national id', async () => {
      await signInDemo('owner@demo.test');
      const list = await call('GET', 'employees');
      expect(list.body.data.length).toBeGreaterThanOrEqual(7);
      const one = await call('GET', 'employees/u-accountant');
      expect(one.body.data.nationalId).toBeDefined();
      const saved = await call('PUT', 'employees/u-accountant', { jobTitle: 'Senior accountant', department: 'Accounting', hireDate: '2023-02-01', employmentType: 'full_time' });
      expect(saved.body.data.jobTitle).toBe('Senior accountant');
      expect((await call('PUT', 'employees/u-accountant', { hireDate: 'nope' })).status).toBe(422);
      expect((await call('PUT', 'employees/u-accountant', { managerId: 'u-accountant' })).status).toBe(422);
    });

    it('validates and records salary changes without copying amounts into the audit trail', async () => {
      await signInDemo('owner@demo.test');
      expect((await call('PUT', 'employees/u-tax/salary', { baseSalary: '0', effectiveFrom: '2026-10-01', components: [] })).status).toBe(422);
      expect((await call('PUT', 'employees/u-tax/salary', { baseSalary: '20000.00', effectiveFrom: '2026-10-01', components: [{ name: 'Bad', kind: 'bonus', amount: '1' }] })).status).toBe(422);
      const ok = await call('PUT', 'employees/u-tax/salary', { baseSalary: '20000.00', effectiveFrom: '2026-10-01', components: [{ name: 'Transport', kind: 'allowance', amount: '500.00' }] });
      expect(ok.status).toBe(200);
      expect(ok.body.data.history.length).toBe(2);
      await signInDemo('superadmin@demo.test');
      const events = await firstValueFrom(http.get<{ data: { action: string; after: string }[] }>('/api/v1/staff/audit/events?action=hr.salary_update&pageSize=50'));
      expect(events.data.length).toBeGreaterThan(0);
      expect(events.data.every((e) => !/20000/.test(e.after))).toBe(true);
    });
  });

  describe('leave', () => {
    it('counts working days only and never weekends', async () => {
      await signInDemo('accountant@demo.test');
      // Thursday to Sunday: Friday and Saturday are the weekend.
      const r = await apply({ from: '2026-12-03', to: '2026-12-06' });
      expect(r.status).toBe(201);
      expect(r.body.data.days).toBe(2);
      expect((await apply({ from: '2026-12-11', to: '2026-12-12' })).body.errors.from).toBeDefined();
    });

    it('rejects overlaps, a backwards range, a year-crossing range and too many days', async () => {
      await signInDemo('accountant@demo.test');
      expect((await apply({ from: '2026-10-26', to: '2026-10-26' })).body.errors.from).toBeDefined(); // inside the pending lv-003
      expect((await apply({ from: '2026-11-10', to: '2026-11-01' })).status).toBe(422);
      expect((await apply({ from: '2026-12-28', to: '2027-01-05' })).status).toBe(422);
      expect((await apply({ from: '2026-11-01', to: '2026-12-31' })).body.errors.typeId).toBeDefined(); // far more than the annual balance
    });

    it('lets only an approver decide, never on their own request, and demands a reason to reject', async () => {
      await signInDemo('accountant@demo.test');
      expect((await call('POST', 'leave/lv-003/approve', {})).status).toBe(403);
      await signInDemo('owner@demo.test');
      const own = (await apply({ from: '2026-11-15', to: '2026-11-15' })).body.data.id as string;
      expect((await call('POST', `leave/${own}/approve`, {})).status).toBe(409);
      expect((await call('POST', 'leave/lv-003/reject', {})).status).toBe(422);
      const done = await call('POST', 'leave/lv-003/approve', { note: 'Enjoy' });
      expect(done.body.data.status).toBe('approved');
      expect((await call('POST', 'leave/lv-003/approve', {})).status).toBe(409);
      await signInDemo('superadmin@demo.test');
      expect((await call('POST', `leave/${own}/approve`, {})).status).toBe(200);
    });

    it('moves the balance when leave is applied for and approved, and gives it back on cancel', async () => {
      await signInDemo('accountant@demo.test');
      const before = (await call('GET', 'leave-balances')).body.data.find((b: { typeId: string }) => b.typeId === 'lt-annual');
      const id = (await apply({ from: '2026-11-22', to: '2026-11-23' })).body.data.id as string;
      const during = (await call('GET', 'leave-balances')).body.data.find((b: { typeId: string }) => b.typeId === 'lt-annual');
      expect(during.pending).toBe(before.pending + 2);
      expect((await call('POST', `leave/${id}/cancel`, {})).status).toBe(200);
      const after = (await call('GET', 'leave-balances')).body.data.find((b: { typeId: string }) => b.typeId === 'lt-annual');
      expect(after.remaining).toBe(before.remaining);
    });

    it('shows ordinary staff only their own applications', async () => {
      await signInDemo('accountant@demo.test');
      const own = (await call('GET', 'leave')).body.data as { userId: string }[];
      expect(own.every((l) => l.userId === 'u-accountant')).toBe(true);
      expect((await call('GET', 'leave-balances?userId=u-owner')).status).toBe(403);
      expect((await call('GET', 'leave/lv-001')).status).toBe(404);
    });
  });

  describe('payroll', () => {
    it('deducts unpaid leave from base salary and totals the run', async () => {
      await signInDemo('owner@demo.test');
      const run = await call('POST', 'payroll/runs', { month: '2026-10' });
      expect(run.status).toBe(201);
      const slip = run.body.data.slips.find((s: { userId: string }) => s.userId === 'u-accountant');
      // 1 unpaid day of 15,000.00 over a 30-day month = 500.00; plus the 750.00 loan repayment.
      expect(slip.unpaidLeaveDays).toBe(1);
      expect(slip.unpaidLeaveDeduction).toBe('500.00');
      expect(slip.gross).toBe('15500.00');
      expect(slip.totalDeductions).toBe('1250.00');
      expect(slip.net).toBe('14250.00');
      expect(run.body.data.totals.net).toBeDefined();
    });

    it('is closed to people without payroll rights and refuses future months', async () => {
      await signInDemo('accountant@demo.test');
      expect((await call('GET', 'payroll/runs')).status).toBe(403);
      expect((await call('POST', 'payroll/runs', { month: '2026-10' })).status).toBe(403);
      await signInDemo('owner@demo.test');
      expect((await call('POST', 'payroll/runs', { month: '2027-01' })).status).toBe(422);
      expect((await call('POST', 'payroll/runs', { month: '10/2026' })).status).toBe(422);
    });

    it('locks a finalised run and shows payslips to their owner only once final', async () => {
      await signInDemo('owner@demo.test');
      await call('POST', 'payroll/runs', { month: '2026-10' });
      await signInDemo('accountant@demo.test');
      expect((await call('GET', 'payroll/slips')).body.data).toEqual([]);
      await signInDemo('owner@demo.test');
      expect((await call('POST', 'payroll/runs/2026-10/finalize', {})).body.data.status).toBe('final');
      expect((await call('POST', 'payroll/runs', { month: '2026-10' })).status).toBe(409);
      expect((await call('POST', 'payroll/runs/2026-10/finalize', {})).status).toBe(409);
      await signInDemo('accountant@demo.test');
      const mine = (await call('GET', 'payroll/slips')).body.data as { userId: string }[];
      expect(mine.length).toBe(1);
      expect(mine[0].userId).toBe('u-accountant');
      expect((await call('GET', 'payroll/slips?userId=u-owner')).status).toBe(403);
    });
  });

  it('keeps client portal users out', async () => {
    await signInDemo('client@demo.test');
    expect((await call('GET', 'settings')).status).toBe(403);
  });
});
