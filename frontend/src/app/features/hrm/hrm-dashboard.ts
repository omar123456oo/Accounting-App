import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard, PieChart } from '../analytics/analytics-charts';
import { AnalyticsFormat } from '../analytics/analytics-format';
import { HrmApiService } from './hrm-api.service';
import { HrDashboard } from './hrm.models';

/** Workforce at a glance. Every figure comes from the HR records the signed-in person may see. */
@Component({
  selector: 'app-hrm-dashboard',
  imports: [TranslatePipe, PageHeader, KpiCard, ChartCard, PieChart, BarList, ColumnChart],
  template: `
    <app-page-header [title]="'hrm.dashboard.title' | translate" />
    <div class="d-flex flex-wrap align-items-end gap-3 mb-3">
      <div>
        <label for="hd-days" class="form-label">{{ 'hrm.dashboard.expiryWindow' | translate }}</label>
        <select id="hd-days" class="form-select" [value]="days()" (change)="setDays($any($event.target).value)">
          @for (d of windows; track d) {
            <option [value]="d">{{ 'hrm.dashboard.days' | translate: { n: d } }}</option>
          }
        </select>
      </div>
    </div>

    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (d(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="users" [label]="'hrm.dashboard.total' | translate" [value]="f.int(d.total)" [hint]="'hrm.dashboard.activeHint' | translate: { active: d.active, inactive: d.inactive }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="user-plus" [label]="'hrm.dashboard.newHires' | translate" [value]="f.int(d.newHires30d)" [hint]="'hrm.dashboard.newHiresHint' | translate" tone="primary" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hourglass-half" [label]="'hrm.dashboard.probation' | translate" [value]="f.int(d.onProbation)" [hint]="'hrm.dashboard.probationHint' | translate" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="file-contract" [label]="'hrm.dashboard.expiring' | translate" [value]="f.int(d.contractsExpiring.count)" [hint]="'hrm.dashboard.expiringHint' | translate: { n: d.contractsExpiring.days }" [tone]="d.contractsExpiring.count ? 'warning' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="door-open" [label]="'hrm.dashboard.turnover' | translate" [value]="f.pct(d.turnover12m.rate)" [hint]="'hrm.dashboard.turnoverHint' | translate: { n: d.turnover12m.terminations }" [tone]="d.turnover12m.rate > 20 ? 'danger' : 'body'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="user-slash" [label]="'hrm.dashboard.left' | translate" [value]="f.int(d.terminated)" [hint]="'hrm.dashboard.leftHint' | translate" /></div>
      </div>

      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'hrm.dashboard.byDepartment' | translate"><app-pie-chart [items]="m().departments" [label]="'hrm.dashboard.byDepartment' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'hrm.dashboard.byType' | translate"><app-pie-chart [items]="m().types" [label]="'hrm.dashboard.byType' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'hrm.dashboard.byBranch' | translate"><app-bar-list [items]="m().branches" [label]="'hrm.dashboard.byBranch' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'hrm.dashboard.hires' | translate"><app-column-chart [items]="m().hires" [label]="'hrm.dashboard.hires' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6">
          <section class="card h-100"><div class="card-body">
            <h3 class="h6 mb-3">{{ 'hrm.dashboard.birthdays' | translate }}</h3>
            <ul class="list-unstyled mb-0 small">
              @for (b of d.upcomingBirthdays; track b.id) {
                <li class="d-flex justify-content-between"><span>{{ b.name }}</span><span class="text-body-secondary" dir="ltr">{{ b.date.slice(5) }} · {{ 'hrm.dashboard.inDays' | translate: { n: b.in } }}</span></li>
              } @empty {
                <li class="text-body-secondary">{{ 'hrm.dashboard.nobody' | translate }}</li>
              }
            </ul>
          </div></section>
        </div>
        <div class="col-lg-6">
          <section class="card h-100"><div class="card-body">
            <h3 class="h6 mb-3">{{ 'hrm.dashboard.anniversaries' | translate }}</h3>
            <ul class="list-unstyled mb-0 small">
              @for (a of d.upcomingAnniversaries; track a.id) {
                <li class="d-flex justify-content-between"><span>{{ a.name }}</span><span class="text-body-secondary" dir="ltr">{{ 'hrm.dashboard.years' | translate: { n: a.years } }} · {{ 'hrm.dashboard.inDays' | translate: { n: a.in } }}</span></li>
              } @empty {
                <li class="text-body-secondary">{{ 'hrm.dashboard.nobody' | translate }}</li>
              }
            </ul>
          </div></section>
        </div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class HrmDashboard {
  private readonly api = inject(HrmApiService);
  protected readonly f = inject(AnalyticsFormat);
  protected readonly windows = [30, 60, 90];
  protected readonly days = signal(60);
  protected readonly d = signal<HrDashboard | null>(null);
  protected readonly failed = signal(false);

  protected readonly m = computed(() => {
    const d = this.d();
    const named = (rows: HrDashboard['byDepartment']): ChartItem[] => rows.map((r) => ({ label: r.name ?? '', labelKey: r.name ? undefined : 'hrm.dashboard.unassigned', value: r.count }));
    return {
      departments: d ? named(d.byDepartment) : [],
      branches: d ? named(d.byBranch) : [],
      types: d ? d.byEmploymentType.map((t): ChartItem => ({ label: '', labelKey: 'hrm.employmentTypes.' + t.type, value: t.count })) : [],
      hires: d ? d.hiresByMonth.map((h): ChartItem => ({ label: this.f.month(h.month), value: h.count })) : [],
    };
  });

  constructor() {
    this.load();
  }

  protected setDays(v: string): void {
    this.days.set(Number(v));
    this.load();
  }

  private load(): void {
    this.api.dashboard(this.days()).subscribe({ next: (d) => (this.d.set(d), this.failed.set(false)), error: () => this.failed.set(true) });
  }
}
