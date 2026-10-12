import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { CommercialApiService } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { CommercialSummary } from './commercial.models';

/** Dashboard widget with real numbers from the commercial API: outstanding receivables, overdue invoices, bills due in 7 days. */
@Component({
  selector: 'app-commercial-summary',
  imports: [RouterLink, TranslatePipe],
  template: `
    <section aria-labelledby="commercial-summary-title" class="mb-4">
      <h2 id="commercial-summary-title" class="h5 mb-3">{{ 'dashboard.commercial.title' | translate }}</h2>
      @if (failed()) {
        <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
      } @else if (summary(); as s) {
        <div class="row g-3">
          @if (canAr) {
            <div class="col-6 col-lg-3">
              <a class="card h-100 text-decoration-none" routerLink="/app/invoicing/invoices" [queryParams]="{ status: 'overdue' }">
                <div class="card-body">
                  <div class="text-body-secondary small">{{ 'dashboard.commercial.overdueInvoices' | translate }}</div>
                  <div class="fs-2 fw-bold" id="work-overdueInvoices">{{ s.overdueInvoices ?? 0 }}</div>
                  @if (!s.overdueInvoices) {
                    <div class="small text-body-secondary">{{ 'dashboard.work.nothing' | translate }}</div>
                  }
                </div>
              </a>
            </div>
          }
          @if (canAp) {
            <div class="col-6 col-lg-3">
              <a class="card h-100 text-decoration-none" routerLink="/app/payables/schedule">
                <div class="card-body">
                  <div class="text-body-secondary small">{{ 'dashboard.commercial.billsDue' | translate }}</div>
                  <div class="fs-2 fw-bold" id="work-billsDue">{{ s.billsDueSoon ?? 0 }}</div>
                  @if (!s.billsDueSoon) {
                    <div class="small text-body-secondary">{{ 'dashboard.work.nothing' | translate }}</div>
                  }
                </div>
              </a>
            </div>
          }
        </div>
        <div class="table-responsive mt-3">
          <table class="table table-sm align-middle" id="commercial-per-ledger">
            <caption class="visually-hidden">{{ 'dashboard.commercial.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'accounting.ledger.label' | translate }}</th>
                @if (canAr) {
                  <th scope="col">{{ 'dashboard.commercial.receivables' | translate }}</th>
                  <th scope="col">{{ 'dashboard.commercial.overdueInvoices' | translate }}</th>
                }
                @if (canAp) {
                  <th scope="col">{{ 'dashboard.commercial.billsDue' | translate }}</th>
                  <th scope="col">{{ 'dashboard.commercial.billsDueAmount' | translate }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (l of s.ledgers; track l.ledgerEntityId) {
                <tr>
                  <td>
                    <a [routerLink]="['/app/invoicing/invoices']" [queryParams]="{ ledger: l.ledgerEntityId }">{{ l.type === 'firm' ? ('accounting.ledger.firm' | translate) : l.name }}</a>
                  </td>
                  @if (canAr) {
                    <td dir="ltr" class="text-end" [id]="'receivables-' + l.ledgerEntityId">{{ format.amount(l.outstandingReceivables ?? '0') }}</td>
                    <td dir="ltr" class="text-end">{{ l.overdueInvoices ?? 0 }}</td>
                  }
                  @if (canAp) {
                    <td dir="ltr" class="text-end">{{ l.billsDueSoon ?? 0 }}</td>
                    <td dir="ltr" class="text-end">{{ format.amount(l.billsDueSoonAmount ?? '0') }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
      }
    </section>
  `,
})
export class CommercialSummaryWidget {
  protected readonly format = inject(CommercialFormat);
  private readonly auth = inject(AuthService);
  protected readonly canAr = this.auth.can('invoices.view');
  protected readonly canAp = this.auth.can('bills.view');
  protected readonly summary = signal<CommercialSummary | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(CommercialApiService)
      .summary()
      .subscribe({ next: (s) => this.summary.set(s), error: () => this.failed.set(true) });
  }
}
