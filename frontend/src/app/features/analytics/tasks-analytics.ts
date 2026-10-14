import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TASK_PRIORITIES, TASK_STATUSES, Task } from '../workflows/workflows.models';
import { TasksApiService } from '../workflows/tasks-api.service';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, KpiCard, PieChart, StackBar, Tone } from './analytics-charts';
import { countBy, fetchAll, pct, topN } from './analytics.helpers';

const STATUS_TONE: Record<string, Tone> = { todo: 'secondary', in_progress: 'primary', blocked: 'danger', done: 'success', cancelled: 'secondary' };
const PRIORITY_TONE: Record<string, Tone> = { low: 'secondary', normal: 'info', high: 'warning', urgent: 'danger' };
const OPEN = ['todo', 'in_progress', 'blocked'];

/** Work in flight: how much is open, how much is late, and who is carrying it. */
@Component({
  selector: 'app-tasks-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar, PieChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="list-check" [label]="'analytics.tasks.open' | translate" [value]="f.int(d.open)" [hint]="'analytics.tasks.total' | translate: { n: d.total }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="clock" [label]="'analytics.tasks.overdue' | translate" [value]="f.int(d.overdue)" [hint]="'analytics.tasks.overdueHint' | translate: { pct: f.pct(d.overdueShare) }" [tone]="d.overdue ? 'danger' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="circle-check" [label]="'analytics.tasks.completion' | translate" [value]="f.pct(d.completion)" [hint]="'analytics.tasks.completionHint' | translate" tone="success" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="ban" [label]="'analytics.tasks.blocked' | translate" [value]="f.int(d.blocked)" [hint]="'analytics.tasks.blockedHint' | translate" [tone]="d.blocked ? 'warning' : 'body'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tasks.byStatus' | translate"><app-pie-chart [items]="d.byStatus" [label]="'analytics.tasks.byStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tasks.openByPriority' | translate"><app-stack-bar [items]="d.byPriority" [label]="'analytics.tasks.openByPriority' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tasks.workload' | translate"><app-bar-list [items]="d.workload" [label]="'analytics.tasks.workload' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.tasks.lateByPerson' | translate"><app-bar-list [items]="d.lateByPerson" [label]="'analytics.tasks.lateByPerson' | translate" [empty]="'analytics.tasks.noneLate' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class TasksAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly api = inject(TasksApiService);
  protected readonly failed = signal(false);
  private readonly rows = signal<Task[] | null>(null);

  protected readonly m = computed(() => {
    const tasks = this.rows();
    if (!tasks) return null;
    const open = tasks.filter((t) => OPEN.includes(t.status));
    const status = countBy(tasks, (t) => t.status, TASK_STATUSES);
    const openByPriority = countBy(open, (t) => t.priority, TASK_PRIORITIES);
    const late = open.filter((t) => t.overdue);
    return {
      total: tasks.length,
      open: open.length,
      overdue: late.length,
      overdueShare: pct(late.length, open.length),
      completion: pct(status['done'], status['done'] + open.length),
      blocked: status['blocked'],
      byStatus: TASK_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'tasks.status.' + s, value: status[s], tone: STATUS_TONE[s] })),
      byPriority: TASK_PRIORITIES.map((p): ChartItem => ({ label: '', labelKey: 'tasks.priority.' + p, value: openByPriority[p], tone: PRIORITY_TONE[p] })),
      workload: topN(Object.entries(countBy(open, (t) => t.assigneeName)), ([, v]) => v, 8).map(([k, v]): ChartItem => ({ label: k, value: v })),
      lateByPerson: topN(Object.entries(countBy(late, (t) => t.assigneeName)), ([, v]) => v, 8).map(([k, v]): ChartItem => ({ label: k, value: v, tone: 'danger' })),
    };
  });

  constructor() {
    fetchAll((p) => this.api.list({ page: p, pageSize: 100, mine: false })).subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }
}
