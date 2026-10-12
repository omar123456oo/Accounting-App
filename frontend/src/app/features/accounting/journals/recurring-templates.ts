import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { sum } from '../../../core/money/money';
import { RecurringTemplate } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { JournalsApiService } from '../journals-api.service';

/** A plain list of recurring-entry templates; "create draft" copies one into a new draft (no scheduler). */
@Component({
  selector: 'app-recurring-templates',
  imports: [TranslatePipe],
  template: `
    @if (templates().length > 0 && auth.can('journals.create')) {
      <section class="mt-4" aria-labelledby="rt-title">
        <h2 id="rt-title" class="h5">{{ 'accounting.recurring.title' | translate }}</h2>
        <p class="text-body-secondary">{{ 'accounting.recurring.hint' | translate }}</p>
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'accounting.recurring.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'accounting.recurring.name' | translate }}</th>
                <th scope="col">{{ 'accounting.journals.fields.total' | translate }}</th>
                <th scope="col">{{ 'accounting.journals.fields.postingDate' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (t of templates(); track t.id) {
                <tr>
                  <td>{{ t.name }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(total(t)) }}</td>
                  <td>
                    <label [for]="'rt-date-' + t.id" class="visually-hidden">{{ 'accounting.journals.fields.postingDate' | translate }}</label>
                    <input [id]="'rt-date-' + t.id" type="date" class="form-control form-control-sm" (input)="setDate(t.id, $any($event.target).value)" />
                  </td>
                  <td class="text-end">
                    <button type="button" class="btn btn-outline-primary btn-sm" [disabled]="busy() || !dates()[t.id]" (click)="createDraft(t)">
                      {{ 'accounting.recurring.createDraft' | translate }}<span class="visually-hidden"> {{ t.name }}</span>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (error(); as message) {
          <div class="alert alert-danger" role="alert">{{ message }}</div>
        }
      </section>
    }
  `,
})
export class RecurringTemplates implements OnInit {
  readonly ledgerId = input.required<string>();
  protected readonly auth = inject(AuthService);
  protected readonly format = inject(AccountingFormat);
  private readonly api = inject(JournalsApiService);
  private readonly router = inject(Router);
  protected readonly templates = signal<RecurringTemplate[]>([]);
  protected readonly dates = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.templates(this.ledgerId()).subscribe({ next: (t) => this.templates.set(t), error: () => this.templates.set([]) });
  }

  protected setDate(id: string, value: string): void {
    this.dates.update((d) => ({ ...d, [id]: value }));
  }

  protected total(t: RecurringTemplate): string {
    return sum(t.lines.map((l) => l.debit));
  }

  protected createDraft(t: RecurringTemplate): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.createFromTemplate(this.ledgerId(), t.id, this.dates()[t.id]).subscribe({
      next: (entry) => void this.router.navigate(['/app/accounting/journals', entry.id]),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}
