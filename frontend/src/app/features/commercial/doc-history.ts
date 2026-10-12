import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommercialFormat } from './commercial-format';
import { DocEvent, LinkedJournal } from './commercial.models';
import { RouterLink } from '@angular/router';

/** The document's linked journal entries (drill-down to the ledger) and its append-only history. */
@Component({
  selector: 'app-doc-history',
  imports: [TranslatePipe, RouterLink],
  template: `
    @if (journals().length > 0) {
      <section aria-labelledby="journals-title" class="mt-4">
        <h2 id="journals-title" class="h5">{{ 'commercial.journals.title' | translate }}</h2>
        <ul class="list-group">
          @for (j of journals(); track j.journalId) {
            <li class="list-group-item">
              <a [routerLink]="['/app/accounting/journals', j.journalId]" [queryParams]="{ ledger: ledgerId() }">{{ j.number ?? j.journalId }}</a>
              - {{ 'commercial.journals.kinds.' + j.kind | translate }} - {{ format.date(j.date) }}
            </li>
          }
        </ul>
      </section>
    }
    <section aria-labelledby="history-title" class="mt-4">
      <h2 id="history-title" class="h5">{{ 'commercial.history.title' | translate }}</h2>
      <ol class="list-group list-group-numbered">
        @for (h of history(); track $index) {
          <li class="list-group-item">
            <span class="fw-semibold">{{ 'commercial.history.actions.' + h.action | translate }}</span>
            - {{ h.actor }}, {{ format.dateTime(h.at) }}
            @if (h.outcome) {
              <span class="d-block small text-body-secondary">{{ h.outcome }}</span>
            }
          </li>
        }
      </ol>
    </section>
  `,
})
export class DocHistory {
  protected readonly format = inject(CommercialFormat);
  readonly journals = input<readonly LinkedJournal[]>([]);
  readonly history = input.required<readonly DocEvent[]>();
  readonly ledgerId = input<string>('');
}
