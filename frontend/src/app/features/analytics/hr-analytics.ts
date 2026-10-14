import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { HrApiService } from '../hr/hr-api.service';
import { HrFormat } from '../hr/hr-format';
import { EmployeeProfile, LeaveApplication, LeaveType, PayrollRun } from '../hr/hr.models';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard, StackBar, Tone } from './analytics-charts';
import { countBy, pct, toNumber } from './analytics.helpers';

const LEAVE_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'secondary' };

interface Data {
  employees: EmployeeProfile[];
  leaves: LeaveApplication[];
  types: LeaveType[];
  runs: PayrollRun[] | null; // null when the user may not see payroll
}

/** People: headcount and mix, leave pressure and, for those allowed to see money, what payroll costs month by month. */
@Component({
  selector: 'app-hr-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar, ColumnChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="people-group" [label]="'analytics.hr.headcount' | translate" [value]="f.int(d.active)" [hint]="'analytics.hr.headcountHint' | translate: { n: d.total }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="plane-departure" [label]="'analytics.hr.onLeave' | translate" [value]="f.int(d.onLeave)" [hint]="'analytics.hr.onLeaveHint' | translate: { pct: f.pct(d.onLeaveShare) }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hourglass-half" [label]="'analytics.hr.pending' | translate" [value]="f.int(d.pending)" [hint]="'analytics.hr.pendingHint' | translate" [tone]="d.pending ? 'warning' : 'success'" /></div>
        @if (d.payroll; as p) {
          <div class="col-6 col-lg-3"><app-kpi-card icon="money-check-dollar" [label]="'analytics.hr.netCost' | translate" [value]="p.latestMonth ? hr.money(p.latestNet) : '—'" [hint]="p.latestMonth ? ('analytics.hr.netCostHint' | translate: { month: hr.month(p.latestMonth), avg: hr.money(p.averageNet) }) : ('analytics.hr.noFinalRuns' | translate)" /></div>
        } @else {
          <div class="col-6 col-lg-3"><app-kpi-card icon="calendar-day" [label]="'analytics.hr.leaveDays' | translate" [value]="f.int(d.leaveDays)" [hint]="'analytics.hr.leaveDaysHint' | translate" /></div>
        }
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.hr.byDepartment' | translate"><app-bar-list [items]="d.byDepartment" [label]="'analytics.hr.byDepartment' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.hr.byContract' | translate"><app-stack-bar [items]="d.byContract" [label]="'analytics.hr.byContract' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.hr.leaveByType' | translate"><app-bar-list [items]="d.leaveByType" [label]="'analytics.hr.leaveByType' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.hr.leaveByStatus' | translate"><app-stack-bar [items]="d.leaveByStatus" [label]="'analytics.hr.leaveByStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        @if (d.payroll; as p) {
          <div class="col-12"><app-chart-card [title]="'analytics.hr.payrollTrend' | translate"><app-column-chart [items]="p.trend" [label]="'analytics.hr.payrollTrend' | translate" [empty]="'analytics.hr.noFinalRuns' | translate" /></app-chart-card></div>
        }
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class HrAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  protected readonly hr = inject(HrFormat);
  private readonly api = inject(HrApiService);
  private readonly auth = inject(AuthService);
  protected readonly failed = signal(false);
  private readonly data = signal<Data | null>(null);

  protected readonly m = computed(() => {
    const r = this.data();
    if (!r) return null;
    const active = r.employees.filter((e) => e.status === 'active');
    const year = String(new Date().getFullYear());
    const thisYear = r.leaves.filter((l) => l.from.startsWith(year) && (l.status === 'approved' || l.status === 'pending'));
    const days: Record<string, number> = {};
    for (const l of thisYear) days[l.typeId] = (days[l.typeId] ?? 0) + l.days;
    const status = countBy(r.leaves, (l) => l.status, ['pending', 'approved', 'rejected', 'cancelled']);
    const contract = countBy(active, (e) => e.employmentType, ['full_time', 'part_time', 'contract']);
    const finals = (r.runs ?? []).filter((x) => x.status === 'final').sort((a, b) => a.month.localeCompare(b.month));
    const latest = finals[finals.length - 1];
    return {
      total: r.employees.length,
      active: active.length,
      onLeave: active.filter((e) => e.onLeaveToday).length,
      onLeaveShare: pct(active.filter((e) => e.onLeaveToday).length, active.length),
      pending: status['pending'],
      leaveDays: thisYear.reduce((n, l) => n + l.days, 0),
      byDepartment: Object.entries(countBy(active, (e) => e.department))
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]): ChartItem => ({ label: k, value: v })),
      byContract: Object.entries(contract).map(([k, v]): ChartItem => ({ label: '', labelKey: 'hr.employees.types.' + k, value: v, tone: k === 'full_time' ? 'primary' : k === 'part_time' ? 'info' : 'secondary' })),
      leaveByType: r.types.map((t): ChartItem => ({ label: this.hr.name(t), value: days[t.id] ?? 0, tone: t.paid ? 'primary' : 'warning' })),
      leaveByStatus: Object.entries(status).map(([k, v]): ChartItem => ({ label: '', labelKey: 'hr.leave.status.' + k, value: v, tone: LEAVE_TONE[k] })),
      payroll: latest
        ? {
            latestMonth: latest.month,
            latestNet: latest.totals.net,
            averageNet: latest.slips.length ? (toNumber(latest.totals.net) / latest.slips.length).toFixed(2) : '0.00',
            trend: finals.slice(-6).map((x): ChartItem => ({ label: this.f.month(x.month), value: toNumber(x.totals.net), display: this.f.compactMoney(x.totals.net) })),
          }
        : r.runs
          ? { latestMonth: '', latestNet: '0.00', averageNet: '0.00', trend: [] as ChartItem[] }
          : null,
    };
  });

  constructor() {
    forkJoin({
      employees: this.api.employees(),
      leaves: this.api.leave(),
      types: this.api.leaveTypes(),
      runs: this.auth.can('payroll.view')
        ? this.api.runs().pipe(
            switchMap((list) => (list.length ? forkJoin(list.map((x) => this.api.run(x.month))) : of([] as PayrollRun[]))),
            catchError(() => of(null)),
          )
        : of(null),
    }).subscribe({ next: (d) => this.data.set(d), error: () => this.failed.set(true) });
  }
}
