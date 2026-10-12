import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** States the basis of the numbers in words: posted only, or a DRAFT-INCLUDED preview that must not be mistaken for the books. */
@Component({
  selector: 'app-report-banner',
  imports: [TranslatePipe],
  template: `
    @if (includesUnposted()) {
      <div class="alert alert-warning py-2" role="status"><strong>{{ 'accounting.reports.draftIncluded' | translate }}</strong> - {{ 'accounting.reports.draftIncludedNote' | translate }}</div>
    } @else {
      <div class="alert alert-secondary py-2" role="status"><strong>{{ 'accounting.reports.postedOnly' | translate }}</strong> - {{ 'accounting.reports.postedOnlyNote' | translate }}</div>
    }
  `,
})
export class ReportBanner {
  readonly includesUnposted = input.required<boolean>();
}
