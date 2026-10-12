import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { AccountingSummary } from '../accounting/accounting-summary';
import { WorkSummary } from './work-summary';

/** Honest dashboard: only the work counts that exist today, no fake widgets. */
@Component({
  selector: 'app-dashboard',
  imports: [TranslatePipe, WorkSummary, AccountingSummary],
  template: `
    <h1 class="h4 mb-3">{{ 'nav.dashboard' | translate }}</h1>
    <app-work-summary />
    @if (auth.can('ledger.view')) {
      <app-accounting-summary />
    }
    <div class="alert alert-info" role="status">{{ 'dashboard.laterPhases' | translate }}</div>
  `,
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
}
