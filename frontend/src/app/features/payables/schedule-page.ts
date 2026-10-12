import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { LedgerContext } from '../accounting/ledger-context';
import { CommercialApiService } from '../commercial/commercial-api.service';
import { CommercialFormat } from '../commercial/commercial-format';
import { ScheduleItem } from '../commercial/commercial.models';

const TONE = { overdue: 'danger', this_week: 'warning', later: 'secondary' } as const;

/** Payment scheduling: open supplier bills by due date, with how urgent each one is stated in text. */
@Component({
  selector: 'app-schedule-page',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge],
  template: `
    <app-page-header [title]="'commercial.schedule.title' | translate" />
    <div class="mb-3" style="max-inline-size: 16rem">
      <label for="schedule-days" class="form-label">{{ 'commercial.schedule.horizon' | translate }}</label>
      <select id="schedule-days" class="form-select" (change)="load(+$any($event.target).value)">
        @for (d of horizons; track d) {
          <option [value]="d" [selected]="d === days()">{{ 'commercial.schedule.days' | translate: { days: d } }}</option>
        }
      </select>
    </div>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rows(); as list) {
      @if (list.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.schedule.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle" id="schedule-table">
            <caption class="visually-hidden">{{ 'commercial.schedule.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.schedule.urgency' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.reference' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.apParty' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.dueDate' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.balance' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of list; track s.docId) {
                <tr>
                  <td><app-status-badge [label]="'commercial.schedule.buckets.' + s.bucket | translate" [tone]="tone[s.bucket]" /></td>
                  <td dir="ltr" class="text-start"><a [routerLink]="['/app/payables/bills', s.docId]">{{ s.reference }}</a></td>
                  <td>{{ s.partyName }}</td>
                  <td>{{ format.date(s.dueDate) }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(s.balance) }}</td>
                  <td class="text-end">
                    @if (canPay) {
                      <a class="btn btn-outline-secondary btn-sm" routerLink="/app/payables/payments/new" [queryParams]="{ billId: s.docId, supplierId: s.supplierId }">{{ 'commercial.payments.ap.new' | translate }}<span class="visually-hidden"> {{ s.reference }}</span></a>
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
export class SchedulePage {
  private readonly api = inject(CommercialApiService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly canPay = inject(AuthService).can('payments.record');
  protected readonly tone = TONE;
  protected readonly horizons = [7, 14, 30, 60];
  protected readonly days = signal(30);
  protected readonly rows = signal<ScheduleItem[] | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.load(30);
  }

  protected load(days: number): void {
    this.days.set(days);
    this.failed.set(false);
    this.api.schedule(this.ledgerId, days).subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }
}
