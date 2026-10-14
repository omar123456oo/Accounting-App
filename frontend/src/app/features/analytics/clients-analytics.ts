import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { CLIENT_STATUSES, Client, LEGAL_FORMS } from '../clients/client.models';
import { ClientsApiService } from '../clients/clients-api.service';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard, PieChart, StackBar, Tone } from './analytics-charts';
import { countBy, daysBetween, fetchAll, lastMonths, monthKey, pct, todayIso } from './analytics.helpers';

const STATUS_TONE: Record<string, Tone> = { lead: 'info', onboarding: 'warning', active: 'success', suspended: 'secondary', closed: 'danger' };

/** Client portfolio: where clients are in their lifecycle, who carries them, and how fast the book is growing. */
@Component({
  selector: 'app-clients-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar, ColumnChart, PieChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="users" [label]="'analytics.clients.total' | translate" [value]="f.int(d.total)" [hint]="'analytics.clients.activeShare' | translate: { pct: f.pct(d.activeShare) }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="user-plus" [label]="'analytics.clients.new90' | translate" [value]="f.int(d.new90)" [hint]="'analytics.clients.new90Hint' | translate" tone="primary" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="user-slash" [label]="'analytics.clients.unassigned' | translate" [value]="f.int(d.unassigned)" [hint]="'analytics.clients.unassignedHint' | translate" [tone]="d.unassigned ? 'warning' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hourglass-half" [label]="'analytics.clients.inPipeline' | translate" [value]="f.int(d.pipeline)" [hint]="'analytics.clients.pipelineHint' | translate" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.clients.byStatus' | translate"><app-stack-bar [items]="d.byStatus" [label]="'analytics.clients.byStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.clients.byForm' | translate"><app-pie-chart [items]="d.byForm" [label]="'analytics.clients.byForm' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.clients.perAccountant' | translate"><app-bar-list [items]="d.perAccountant" [label]="'analytics.clients.perAccountant' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.clients.growth' | translate"><app-column-chart [items]="d.growth" [label]="'analytics.clients.growth' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class ClientsAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly api = inject(ClientsApiService);
  protected readonly failed = signal(false);
  private readonly rows = signal<{ clients: Client[]; users: Map<string, string> } | null>(null);

  protected readonly m = computed(() => {
    const r = this.rows();
    if (!r) return null;
    const { clients, users } = r;
    const status = countBy(clients, (c) => c.status, CLIENT_STATUSES);
    const perAccountant = countBy(clients.flatMap((c) => c.assignedAccountantIds), (id) => id);
    const today = todayIso();
    const months = lastMonths(monthKey(today), 6);
    const created = countBy(clients, (c) => monthKey(c.createdAt), months);
    return {
      total: clients.length,
      activeShare: pct(status['active'], clients.length),
      new90: clients.filter((c) => daysBetween(c.createdAt.slice(0, 10), today) <= 90).length,
      unassigned: clients.filter((c) => c.assignedAccountantIds.length === 0 && c.status !== 'closed').length,
      pipeline: status['lead'] + status['onboarding'],
      byStatus: CLIENT_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'clients.status.' + s, value: status[s], tone: STATUS_TONE[s] })),
      byForm: Object.entries(countBy(clients, (c) => c.legalForm, LEGAL_FORMS)).map(([k, v]): ChartItem => ({ label: '', labelKey: 'clients.legalForm.' + k, value: v })),
      perAccountant: Object.entries(perAccountant)
        .sort((a, b) => b[1] - a[1])
        .map(([id, v]): ChartItem => ({ label: users.get(id) ?? id, value: v })),
      growth: months.map((mo): ChartItem => ({ label: this.f.month(mo), value: created[mo] })),
    };
  });

  constructor() {
    forkJoin({ clients: fetchAll((p) => this.api.list({ page: p, pageSize: 100 })), users: this.api.assignableUsers() }).subscribe({
      next: ({ clients, users }) => this.rows.set({ clients, users: new Map(users.map((u) => [u.id, u.name])) }),
      error: () => this.failed.set(true),
    });
  }
}
