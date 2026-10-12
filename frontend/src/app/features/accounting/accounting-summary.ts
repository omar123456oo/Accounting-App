import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LedgerSummary } from './accounting.models';
import { LedgerApiService } from './ledger-api.service';

/** Dashboard widget for accountants: entries waiting for approval and the open periods, per ledger the user may see. */
@Component({
  selector: 'app-accounting-summary',
  imports: [RouterLink, TranslatePipe],
  template: `
    <section aria-labelledby="acc-summary-title" class="mb-4">
      <h2 id="acc-summary-title" class="h5 mb-3">{{ 'accounting.summary.title' | translate }}</h2>
      @if (failed()) {
        <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
      } @else if (summary(); as s) {
        <div class="row g-3">
          <div class="col-6 col-lg-3">
            <div class="card h-100"><div class="card-body">
              <div class="text-body-secondary small">{{ 'accounting.summary.awaiting' | translate }}</div>
              <div class="fs-2 fw-bold" id="work-journalsAwaiting">{{ s.awaitingApproval }}</div>
              @if (s.awaitingApproval === 0) {
                <div class="small text-body-secondary">{{ 'dashboard.work.nothing' | translate }}</div>
              }
            </div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="card h-100"><div class="card-body">
              <div class="text-body-secondary small">{{ 'accounting.summary.openPeriods' | translate }}</div>
              <div class="fs-2 fw-bold" id="work-openPeriods">{{ s.openPeriods }}</div>
            </div></div>
          </div>
        </div>
        <ul class="list-unstyled mt-3 mb-0">
          @for (l of s.ledgers; track l.ledgerEntityId) {
            <li>
              <a [routerLink]="['/app/accounting/journals']" [queryParams]="{ ledger: l.ledgerEntityId, status: 'pending_approval' }">
                {{ l.type === 'firm' ? ('accounting.ledger.firm' | translate) : l.name }}
              </a>
              - {{ 'accounting.summary.perLedger' | translate: { awaiting: l.awaitingApproval, open: l.openPeriods } }}
            </li>
          }
        </ul>
      } @else {
        <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
      }
    </section>
  `,
})
export class AccountingSummary {
  protected readonly summary = signal<LedgerSummary | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(LedgerApiService).summary().subscribe({ next: (s) => this.summary.set(s), error: () => this.failed.set(true) });
  }
}
