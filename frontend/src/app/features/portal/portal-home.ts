import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { AnalyticsFormat } from '../analytics/analytics-format';
import { KpiCard } from '../analytics/analytics-charts';
import { EngageApiService } from '../engage/engage-api.service';
import { PortalOverview } from '../engage/engage.models';

/** What a client needs at a glance: what they owe, what waits for them, and what is booked. */
@Component({
  selector: 'app-portal-home',
  imports: [TranslatePipe, RouterLink, KpiCard],
  template: `
    <h1 class="h3 mb-1">{{ 'portal.welcome' | translate }} {{ auth.user()?.name }}</h1>
    @if (overview(); as o) {
      <p class="text-body-secondary">{{ o.clientName }}</p>
      <div class="row g-3">
        <div class="col-6 col-lg-3"><a routerLink="/portal/invoices" class="text-decoration-none"><app-kpi-card icon="file-invoice-dollar" [label]="'portal.home.unpaid' | translate" [value]="f.money(o.unpaidAmount)" [hint]="'portal.home.unpaidHint' | translate: { n: o.unpaidInvoices }" [tone]="o.unpaidInvoices ? 'warning' : 'success'" /></a></div>
        <div class="col-6 col-lg-3"><a routerLink="/portal/documents" class="text-decoration-none"><app-kpi-card icon="folder-open" [label]="'portal.home.requests' | translate" [value]="f.int(o.openRequests)" [hint]="'portal.home.requestsHint' | translate" [tone]="o.openRequests ? 'warning' : 'success'" /></a></div>
        <div class="col-6 col-lg-3"><a routerLink="/portal/tickets" class="text-decoration-none"><app-kpi-card icon="comments" [label]="'portal.home.tickets' | translate" [value]="f.int(o.openTickets)" [hint]="'portal.home.ticketsHint' | translate" /></a></div>
        <div class="col-6 col-lg-3"><a routerLink="/portal/appointments" class="text-decoration-none"><app-kpi-card icon="calendar-check" [label]="'portal.home.appointments' | translate" [value]="f.int(o.upcomingAppointments)" [hint]="'portal.home.appointmentsHint' | translate" /></a></div>
      </div>
    } @else if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class PortalHome {
  protected readonly auth = inject(AuthService);
  protected readonly f = inject(AnalyticsFormat);
  protected readonly overview = signal<PortalOverview | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(EngageApiService).overview().subscribe({ next: (o) => this.overview.set(o), error: () => this.failed.set(true) });
  }
}
