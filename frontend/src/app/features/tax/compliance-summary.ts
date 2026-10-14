import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ComplianceSummary } from './tax.models';
import { TaxApiService } from './tax-api.service';

/** Dashboard widget for tax staff: filing deadlines and returns across the ledgers the user may see. */
@Component({
  selector: 'app-compliance-summary',
  imports: [TranslatePipe],
  template: `
    <section aria-labelledby="compliance-summary-title" class="mb-4">
      <h2 id="compliance-summary-title" class="h5 mb-3">{{ 'dashboard.compliance.title' | translate }}</h2>
      @if (failed()) {
        <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
      } @else if (summary(); as s) {
        <div class="row g-3">
          @for (c of cards(s); track c.key) {
            <div class="col-6 col-lg-3">
              <div class="card h-100"><div class="card-body">
                <div class="text-body-secondary small">{{ 'dashboard.compliance.' + c.key | translate }}</div>
                <div class="fs-2 fw-bold" [class.text-danger]="c.alert && c.value > 0" [id]="'compliance-' + c.key">{{ c.value }}</div>
              </div></div>
            </div>
          }
        </div>
      } @else {
        <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
      }
    </section>
  `,
})
export class ComplianceSummaryWidget {
  protected readonly summary = signal<ComplianceSummary | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(TaxApiService).complianceSummary().subscribe({ next: (s) => this.summary.set(s), error: () => this.failed.set(true) });
  }

  protected cards(s: ComplianceSummary) {
    return [
      { key: 'overdue', value: s.overdue, alert: true },
      { key: 'deadlines7', value: s.deadlines7, alert: false },
      { key: 'deadlines30', value: s.deadlines30, alert: false },
      { key: 'returnsAwaitingReview', value: s.returnsAwaitingReview, alert: false },
    ];
  }
}
