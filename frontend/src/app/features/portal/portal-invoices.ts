import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AnalyticsFormat } from '../analytics/analytics-format';
import { BadgeTone, StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { EngageApiService } from '../engage/engage-api.service';
import { PortalInvoice } from '../engage/engage.models';

const TONE: Record<string, BadgeTone> = { issued: 'info', partially_paid: 'primary' as BadgeTone, paid: 'success', overdue: 'danger', credited: 'secondary' };

/** The client's issued invoices, read-only. Drafts and internal history are never sent to the portal. */
@Component({
  selector: 'app-portal-invoices',
  imports: [TranslatePipe, StatusBadge],
  template: `
    <h1 class="h3 mb-3">{{ 'portal.tabs.invoices' | translate }}</h1>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rows(); as list) {
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ 'portal.tabs.invoices' | translate }}</caption>
          <thead><tr><th scope="col">{{ 'portal.invoices.number' | translate }}</th><th scope="col">{{ 'portal.invoices.date' | translate }}</th><th scope="col">{{ 'portal.invoices.due' | translate }}</th><th scope="col" class="text-end">{{ 'portal.invoices.total' | translate }}</th><th scope="col" class="text-end">{{ 'portal.invoices.balance' | translate }}</th><th scope="col">{{ 'tickets.status' | translate }}</th></tr></thead>
          <tbody>
            @for (i of list; track i.id) {
              <tr>
                <td>{{ i.reference }}</td>
                <td>{{ dates.date(i.date) }}</td>
                <td>{{ dates.date(i.dueDate) }}</td>
                <td class="text-end" dir="ltr">{{ f.money(i.total) }}</td>
                <td class="text-end fw-semibold" dir="ltr">{{ f.money(i.balance) }}</td>
                <td><app-status-badge [label]="'commercial.status.' + i.status | translate" [tone]="tone[i.status] ?? 'secondary'" /></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="text-center text-body-secondary py-4">{{ 'portal.invoices.none' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class PortalInvoices {
  protected readonly f = inject(AnalyticsFormat);
  protected readonly dates = inject(ClientFormat);
  protected readonly tone = TONE;
  protected readonly rows = signal<PortalInvoice[] | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(EngageApiService).portalInvoices().subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }
}
