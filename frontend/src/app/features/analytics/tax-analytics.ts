import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin, switchMap } from 'rxjs';
import { BusinessClock } from '../commercial/commercial-api.service';
import { RETURN_KINDS, RETURN_STATES, Deadline, TaxReturn } from '../tax/tax.models';
import { TaxApiService } from '../tax/tax-api.service';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, KpiCard, StackBar, Tone } from './analytics-charts';
import { addDaysIso, countBy, fetchAll, pct } from './analytics.helpers';
import { watchLedger } from './ledger-analytics';

const DEADLINE_TONE: Record<string, Tone> = { upcoming: 'info', due_soon: 'warning', overdue: 'danger', done: 'success' };
const STATE_TONE: Record<string, Tone> = { prepared: 'secondary', reviewed: 'info', approved: 'primary', ready_for_submission: 'success' };

/** Tax compliance of the selected ledger: deadlines that are late or close, and how far the returns have travelled. */
@Component({
  selector: 'app-tax-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="calendar-xmark" [label]="'analytics.tax.overdue' | translate" [value]="f.int(d.overdue)" [hint]="'analytics.tax.overdueHint' | translate" [tone]="d.overdue ? 'danger' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="bell" [label]="'analytics.tax.dueSoon' | translate" [value]="f.int(d.dueSoon)" [hint]="'analytics.tax.dueSoonHint' | translate" [tone]="d.dueSoon ? 'warning' : 'body'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="circle-check" [label]="'analytics.tax.onTime' | translate" [value]="f.pct(d.onTime)" [hint]="'analytics.tax.onTimeHint' | translate" tone="success" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="file-signature" [label]="'analytics.tax.returns' | translate" [value]="f.int(d.returns)" [hint]="'analytics.tax.returnsHint' | translate: { n: d.awaitingReview }" [tone]="d.awaitingReview ? 'warning' : 'body'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tax.deadlines' | translate"><app-stack-bar [items]="d.deadlines" [label]="'analytics.tax.deadlines' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tax.pipeline' | translate"><app-stack-bar [items]="d.pipeline" [label]="'analytics.tax.pipeline' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tax.byKind' | translate"><app-bar-list [items]="d.byKind" [label]="'analytics.tax.byKind' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tax.byOwner' | translate"><app-bar-list [items]="d.byOwner" [label]="'analytics.tax.byOwner' | translate" [empty]="'analytics.tax.noneOpen' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class TaxAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly api = inject(TaxApiService);
  private readonly clock = inject(BusinessClock);
  protected readonly failed = signal(false);
  private readonly data = signal<{ deadlines: Deadline[]; returns: TaxReturn[] } | null>(null);

  protected readonly m = computed(() => {
    const r = this.data();
    if (!r) return null;
    const dl = countBy(r.deadlines, (d) => d.status, ['upcoming', 'due_soon', 'overdue', 'done']);
    const st = countBy(r.returns, (x) => x.state, RETURN_STATES);
    const open = r.deadlines.filter((d) => d.status !== 'done');
    return {
      overdue: dl['overdue'],
      dueSoon: dl['due_soon'],
      onTime: pct(dl['done'], dl['done'] + dl['overdue']),
      returns: r.returns.length,
      awaitingReview: st['prepared'],
      deadlines: (['overdue', 'due_soon', 'upcoming', 'done'] as const).map((s): ChartItem => ({ label: '', labelKey: 'analytics.tax.deadline.' + s, value: dl[s], tone: DEADLINE_TONE[s] })),
      pipeline: RETURN_STATES.map((s): ChartItem => ({ label: '', labelKey: 'analytics.tax.state.' + s, value: st[s], tone: STATE_TONE[s] })),
      byKind: Object.entries(countBy(r.returns, (x) => x.kind, RETURN_KINDS)).map(([k, v]): ChartItem => ({ label: '', labelKey: 'analytics.tax.kind.' + k, value: v })),
      byOwner: Object.entries(countBy(open, (d) => d.responsibleName))
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]): ChartItem => ({ label: k, value: v, tone: 'warning' })),
    };
  });

  constructor() {
    watchLedger(
      (ledger) =>
        this.clock.today(ledger).pipe(
          switchMap((today) =>
            forkJoin({
              deadlines: this.api.deadlines(ledger, addDaysIso(today, -180), addDaysIso(today, 180)),
              returns: fetchAll((p) => this.api.returns(ledger, { page: p, pageSize: 100 })),
            }),
          ),
        ),
      (d) => {
        this.data.set(d);
        this.failed.set(d === null);
      },
      () => {
        this.data.set(null);
        this.failed.set(false);
      },
    );
  }
}
