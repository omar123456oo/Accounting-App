import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkSummary } from './work-summary';

/** Honest dashboard: only the work counts that exist today, no fake widgets. */
@Component({
  selector: 'app-dashboard',
  imports: [TranslatePipe, WorkSummary],
  template: `
    <h1 class="h4 mb-3">{{ 'nav.dashboard' | translate }}</h1>
    <app-work-summary />
    <div class="alert alert-info" role="status">{{ 'dashboard.laterPhases' | translate }}</div>
  `,
})
export class Dashboard {}
