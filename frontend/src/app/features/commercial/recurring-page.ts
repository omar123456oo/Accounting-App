import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { LedgerContext } from '../accounting/ledger-context';
import { BusinessClock } from './commercial-api.service';
import { RecurringDoc, Side } from './commercial.models';
import { SettlementApiService } from './settlement-api.service';

/** Recurring invoice or expense templates. "Create draft" makes a normal draft for the chosen date; there is no scheduler. */
@Component({
  selector: 'app-recurring-page',
  imports: [FormsModule, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'commercial.recurring.' + side + '.title' | translate" />
    <p class="text-body-secondary">{{ 'commercial.recurring.intro' | translate }}</p>
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rows(); as list) {
      @if (list.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.recurring.empty' | translate }}</div>
      } @else {
        <div class="mb-3" style="max-inline-size: 16rem">
          <label for="recurring-date" class="form-label">{{ 'commercial.recurring.date' | translate }}</label>
          <input id="recurring-date" type="date" class="form-control" [ngModel]="date()" (ngModelChange)="date.set($event)" />
        </div>
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'commercial.recurring.' + side + '.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.recurring.name' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.' + side + 'Party' | translate }}</th>
                <th scope="col">{{ 'commercial.recurring.lines' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (t of list; track t.id) {
                <tr>
                  <td>{{ t.name }}</td>
                  <td>{{ t.partyName }}</td>
                  <td>{{ t.lines.length }}</td>
                  <td class="text-end">
                    @if (canCreate) {
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !date()" (click)="createDraft(t)">{{ 'commercial.recurring.createDraft' | translate }}<span class="visually-hidden"> {{ t.name }}</span></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class RecurringPage {
  private readonly api = inject(SettlementApiService);
  private readonly router = inject(Router);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly side = inject(ActivatedRoute).snapshot.data['side'] as Side;
  protected readonly canCreate = inject(AuthService).can(this.side === 'ar' ? 'invoices.create' : 'bills.create');
  protected readonly rows = signal<RecurringDoc[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly date = signal('');

  constructor() {
    this.api.recurringTemplates(this.ledgerId, this.side).subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
    inject(BusinessClock)
      .today(this.ledgerId)
      .subscribe((t) => this.date.set(t));
  }

  protected createDraft(template: RecurringDoc): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.createDraftFromTemplate(this.ledgerId, this.side, template.id, this.date()).subscribe({
      next: (doc) => void this.router.navigate([this.side === 'ar' ? '/app/invoicing/invoices' : '/app/payables/bills', doc.id]),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}
