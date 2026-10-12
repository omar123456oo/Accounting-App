import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { Column, DataTable } from '../../shared/components/data-table/data-table';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { LedgerContext } from '../accounting/ledger-context';
import { Page } from '../clients/client.models';
import { CommercialFormat } from './commercial-format';
import { Payment, Side } from './commercial.models';
import { SettlementApiService } from './settlement-api.service';

/** Customer receipts or supplier payments of the active ledger, with what each one still holds unapplied. */
@Component({
  selector: 'app-payment-list',
  imports: [RouterLink, TranslatePipe, DataTable, PageHeader],
  template: `
    <app-page-header [title]="'commercial.payments.' + side + '.title' | translate">
      @if (canRecord) {
        <a class="btn btn-primary" [routerLink]="[base, 'new']">{{ 'commercial.payments.' + side + '.new' | translate }}</a>
      }
    </app-page-header>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (result(); as page) {
      @if (page.data.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.payments.empty' | translate }}</div>
      } @else {
        <app-data-table [columns]="columns" [rows]="page.data" [caption]="'commercial.payments.' + side + '.title' | translate" [page]="page.meta.page" [pageSize]="page.meta.pageSize" [total]="page.meta.total" (pageChange)="load($event)">
          <ng-template let-row>
            <td dir="ltr" class="text-start"><a [routerLink]="[base, row.id]">{{ row.number }}</a></td>
            <td>{{ row.partyName }}</td>
            <td>{{ format.date(row.date) }}</td>
            <td dir="ltr" class="text-end">{{ format.amount(row.amount) }}</td>
            <td dir="ltr" class="text-end">{{ format.amount(row.unapplied) }}</td>
            <td>{{ row.reference }}</td>
          </ng-template>
        </app-data-table>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class PaymentList {
  private readonly api = inject(SettlementApiService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly side = inject(ActivatedRoute).snapshot.data['side'] as Side;
  protected readonly base = this.side === 'ar' ? '/app/invoicing/payments' : '/app/payables/payments';
  protected readonly canRecord = inject(AuthService).can('payments.record');
  protected readonly columns: readonly Column[] = [
    { key: 'number', labelKey: `commercial.payments.col.${this.side}Number` },
    { key: 'party', labelKey: `commercial.docs.col.${this.side}Party` },
    { key: 'date', labelKey: 'commercial.docs.col.date' },
    { key: 'amount', labelKey: 'commercial.payments.amount' },
    { key: 'unapplied', labelKey: 'commercial.payments.unapplied' },
    { key: 'reference', labelKey: 'commercial.payments.reference' },
  ];
  protected readonly result = signal<Page<Payment> | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.api.payments(this.ledgerId, this.side, { page, pageSize: 10 }).subscribe({ next: (p) => this.result.set(p), error: () => this.failed.set(true) });
  }
}
