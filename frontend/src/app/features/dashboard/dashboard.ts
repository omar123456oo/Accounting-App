import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { AccountingSummary } from '../accounting/accounting-summary';
import { CommercialSummaryWidget } from '../commercial/commercial-summary';
import { ComplianceSummaryWidget } from '../tax/compliance-summary';
import { OfficeSummary } from './office-summary';
import { WorkSummary } from './work-summary';

/** Honest dashboard: every widget shows real counts and appears only for users who may see them. */
@Component({
  selector: 'app-dashboard',
  imports: [TranslatePipe, WorkSummary, AccountingSummary, CommercialSummaryWidget, OfficeSummary, ComplianceSummaryWidget],
  template: `
    <h1 class="h3 mb-4">{{ 'nav.dashboard' | translate }}</h1>
    <app-work-summary />
    <app-office-summary />
    @if (auth.can('ledger.view')) {
      <app-accounting-summary />
    }
    @if (auth.can('ledger.view') && (auth.can('invoices.view') || auth.can('bills.view'))) {
      <app-commercial-summary />
    }
    @if (auth.can('tax.view')) {
      <app-compliance-summary />
    }
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
}
