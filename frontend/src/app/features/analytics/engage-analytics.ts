import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { EngageApiService } from '../engage/engage-api.service';
import { APPOINTMENT_STATUSES, Appointment, TICKET_CATEGORIES, TICKET_STATUSES, TicketSummary } from '../engage/engage.models';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard, PieChart, Tone } from './analytics-charts';
import { countBy, lastMonths, monthKey, pct, todayIso, topN } from './analytics.helpers';

const TICKET_TONE: Record<string, Tone> = { open: 'warning', answered: 'info', closed: 'secondary' };
const APPOINTMENT_TONE: Record<string, Tone> = { requested: 'warning', confirmed: 'success', declined: 'danger', cancelled: 'secondary', completed: 'info' };

/** Client service: ticket volume and backlog, and how appointment requests are answered. */
@Component({
  selector: 'app-engage-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, PieChart, ColumnChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="comments" [label]="'analytics.support.tickets' | translate" [value]="f.int(d.tickets)" [hint]="'analytics.support.openHint' | translate: { n: d.open }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="reply" [label]="'analytics.support.awaiting' | translate" [value]="f.int(d.awaiting)" [hint]="'analytics.support.awaitingHint' | translate" [tone]="d.awaiting ? 'warning' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="calendar-check" [label]="'analytics.support.appointments' | translate" [value]="f.int(d.appointments)" [hint]="'analytics.support.pendingHint' | translate: { n: d.requested }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="thumbs-up" [label]="'analytics.support.confirmRate' | translate" [value]="f.pct(d.confirmRate)" [hint]="'analytics.support.confirmRateHint' | translate" tone="success" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.support.ticketsByStatus' | translate"><app-pie-chart [items]="d.ticketStatus" [label]="'analytics.support.ticketsByStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.support.ticketsByCategory' | translate"><app-pie-chart [items]="d.ticketCategory" [label]="'analytics.support.ticketsByCategory' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.support.appointmentsByStatus' | translate"><app-pie-chart [items]="d.appointmentStatus" [label]="'analytics.support.appointmentsByStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.support.ticketsPerMonth' | translate"><app-column-chart [items]="d.perMonth" [label]="'analytics.support.ticketsPerMonth' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.support.topClients' | translate"><app-bar-list [items]="d.topClients" [label]="'analytics.support.topClients' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.support.workload' | translate"><app-bar-list [items]="d.workload" [label]="'analytics.support.workload' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class EngageAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly api = inject(EngageApiService);
  private readonly auth = inject(AuthService);
  protected readonly failed = signal(false);
  private readonly rows = signal<{ tickets: TicketSummary[]; appointments: Appointment[] } | null>(null);

  protected readonly m = computed(() => {
    const r = this.rows();
    if (!r) return null;
    const { tickets, appointments } = r;
    const ts = countBy(tickets, (t) => t.status, TICKET_STATUSES);
    const cat = countBy(tickets, (t) => t.category, TICKET_CATEGORIES);
    const ap = countBy(appointments, (a) => a.status, APPOINTMENT_STATUSES);
    const months = lastMonths(monthKey(todayIso()), 6);
    const created = countBy(tickets, (t) => monthKey(t.createdAt), months);
    const open = tickets.filter((t) => t.status !== 'closed');
    return {
      tickets: tickets.length,
      open: open.length,
      awaiting: open.filter((t) => t.lastSide === 'client').length,
      appointments: appointments.length,
      requested: ap['requested'],
      confirmRate: pct(ap['confirmed'] + ap['completed'], ap['confirmed'] + ap['completed'] + ap['declined']),
      ticketStatus: TICKET_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'tickets.statuses.' + s, value: ts[s], tone: TICKET_TONE[s] })),
      ticketCategory: TICKET_CATEGORIES.map((c): ChartItem => ({ label: '', labelKey: 'tickets.categories.' + c, value: cat[c] })),
      appointmentStatus: APPOINTMENT_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'appointments.statuses.' + s, value: ap[s], tone: APPOINTMENT_TONE[s] })),
      perMonth: months.map((mo): ChartItem => ({ label: this.f.month(mo), value: created[mo] })),
      topClients: topN(Object.entries(countBy(open, (t) => t.clientName)), (e) => e[1], 6).map(([name, v]): ChartItem => ({ label: name, value: v })),
      workload: topN(Object.entries(countBy(open, (t) => t.assigneeName ?? '')), (e) => e[1], 6).map(([name, v]): ChartItem => ({ label: name || '-', labelKey: name ? undefined : 'tickets.unassigned', value: v })),
    };
  });

  constructor() {
    forkJoin({
      tickets: this.auth.can('tickets.manage') ? this.api.tickets('staff') : of([] as TicketSummary[]),
      appointments: this.auth.can('appointments.manage') ? this.api.appointments('staff') : of([] as Appointment[]),
    }).subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }
}
