import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Honest empty state: no fake widgets until the reporting phases exist. */
@Component({
  selector: 'app-dashboard',
  imports: [TranslatePipe],
  template: `
    <h1 class="h4 mb-3">{{ 'nav.dashboard' | translate }}</h1>
    <div class="alert alert-info" role="status">{{ 'dashboard.laterPhases' | translate }}</div>
  `,
})
export class Dashboard {}
