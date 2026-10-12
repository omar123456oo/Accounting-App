import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DataTable, Column } from '../../shared/components/data-table/data-table';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { LedgerContext } from '../accounting/ledger-context';
import { Page } from '../clients/client.models';
import { CommercialFormat } from './commercial-format';
import { CreditNote, Side } from './commercial.models';
import { SettlementApiService } from './settlement-api.service';

/** Credit notes issued to customers or received from suppliers. They are created from the document they correct. */
@Component({
  selector: 'app-credit-list',
  imports: [RouterLink, TranslatePipe, DataTable, PageHeader],
  template: `
    <app-page-header [title]="'commercial.credit.' + side + '.list' | translate" />
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (result(); as page) {
      @if (page.data.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.credit.empty' | translate }}</div>
      } @else {
        <app-data-table [columns]="columns" [rows]="page.data" [caption]="'commercial.credit.' + side + '.list' | translate" [page]="page.meta.page" [pageSize]="page.meta.pageSize" [total]="page.meta.total" (pageChange)="load($event)">
          <ng-template let-row>
            <td dir="ltr" class="text-start">{{ row.number }}</td>
            <td><a [routerLink]="[docBase, row.docId]">{{ row.docReference }}</a></td>
            <td>{{ row.partyName }}</td>
            <td>{{ format.date(row.date) }}</td>
            <td dir="ltr" class="text-end">{{ format.amount(row.amount) }}</td>
            <td>{{ row.reason }}</td>
          </ng-template>
        </app-data-table>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class CreditList {
  private readonly api = inject(SettlementApiService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly side = inject(ActivatedRoute).snapshot.data['side'] as Side;
  protected readonly docBase = this.side === 'ar' ? '/app/invoicing/invoices' : '/app/payables/bills';
  protected readonly columns: readonly Column[] = [
    { key: 'number', labelKey: 'commercial.credit.col.number' },
    { key: 'doc', labelKey: 'commercial.credit.col.document' },
    { key: 'party', labelKey: `commercial.docs.col.${this.side}Party` },
    { key: 'date', labelKey: 'commercial.docs.col.date' },
    { key: 'amount', labelKey: 'commercial.credit.amount' },
    { key: 'reason', labelKey: 'commercial.credit.reason' },
  ];
  protected readonly result = signal<Page<CreditNote> | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.api.creditNotes(this.ledgerId, this.side, { page, pageSize: 10 }).subscribe({ next: (p) => this.result.set(p), error: () => this.failed.set(true) });
  }
}
