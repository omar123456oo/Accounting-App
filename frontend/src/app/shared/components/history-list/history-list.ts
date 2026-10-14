import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ClientFormat } from '../../../features/clients/client-format';

export interface HistoryRow {
  action: string;
  actor: string;
  at: string;
  outcome?: string;
}

/** Append-only history: who did what, when and with which outcome. Action labels come from `<prefix>.<action>`. */
@Component({
  selector: 'app-history-list',
  imports: [TranslatePipe],
  template: `
    <h2 class="h6">{{ 'common.history' | translate }}</h2>
    <ol class="list-group list-group-flush small mb-3" aria-live="polite">
      @for (e of rows(); track $index) {
        <li class="list-group-item px-0">
          <i class="fa-solid fa-clock-rotate-left me-1 text-body-secondary" aria-hidden="true"></i>
          <strong>{{ labelPrefix() + '.' + e.action | translate }}</strong>
          - {{ e.actor }}, {{ dates.dateTime(e.at) }}
          @if (e.outcome) {
            <span class="d-block text-body-secondary">{{ e.outcome }}</span>
          }
        </li>
      }
    </ol>
  `,
})
export class HistoryList {
  readonly rows = input.required<readonly HistoryRow[]>();
  readonly labelPrefix = input.required<string>();
  protected readonly dates = inject(ClientFormat);
}
