import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ClientsApiService } from '../clients/clients-api.service';
import { EngageApiService } from '../engage/engage-api.service';
import { HrApiService } from '../hr/hr-api.service';

interface Card {
  key: string;
  route: string;
  /** Null while loading, -1 when the count could not be loaded. */
  count: number | null;
}

const count = (source: Observable<number>): Observable<number> => source.pipe(catchError(() => of(-1)));

/** Real counts about the office itself: clients, leave requests, client tickets and timesheets waiting for a decision. */
@Component({
  selector: 'app-office-summary',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (cards().length > 0) {
      <section [attr.aria-label]="'dashboard.office.title' | translate" class="mb-4">
        <h2 class="h5 mb-3">{{ 'dashboard.office.title' | translate }}</h2>
        <div class="row g-3">
          @for (card of cards(); track card.key) {
            <div class="col-6 col-lg-3">
              <a class="card h-100 text-decoration-none" [routerLink]="card.route">
                <div class="card-body">
                  <div class="text-body-secondary small">{{ 'dashboard.office.' + card.key | translate }}</div>
                  @if (card.count === null) {
                    <div class="fs-3" role="status">{{ 'common.loading' | translate }}</div>
                  } @else if (card.count < 0) {
                    <div class="small text-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
                  } @else {
                    <div class="fs-2 fw-bold" [id]="'office-' + card.key">{{ card.count }}</div>
                  }
                </div>
              </a>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class OfficeSummary {
  private readonly auth = inject(AuthService);
  private readonly counts = signal<Record<string, number>>({});
  private readonly defs: Array<Omit<Card, 'count'>> = [];

  protected readonly cards = computed<Card[]>(() => this.defs.map((d) => ({ ...d, count: this.counts()[d.key] ?? null })));

  constructor() {
    const load = (key: string, route: string, request: Observable<number>) => {
      this.defs.push({ key, route });
      count(request).subscribe((n) => this.counts.update((c) => ({ ...c, [key]: n })));
    };
    if (this.auth.can('clients.view')) {
      load('activeClients', '/app/clients', inject(ClientsApiService).list({ status: 'active', pageSize: 1 }).pipe(map((p) => p.meta.total)));
    }
    if (this.auth.can('leave.approve')) {
      load('pendingLeave', '/app/hr', inject(HrApiService).leave({ status: 'pending' }).pipe(map((l) => l.length)));
    }
    if (this.auth.can('tickets.manage')) {
      load('openTickets', '/app/tickets', inject(EngageApiService).tickets('staff', { status: 'open' }).pipe(map((t) => t.length)));
    }
    if (this.auth.can('timesheets.approve')) {
      load('pendingTimesheets', '/app/timesheets', inject(EngageApiService).pendingWeeks().pipe(map((w) => w.length)));
    }
  }
}
