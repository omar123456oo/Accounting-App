import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { abs } from '../../../core/money/money';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { CommercialApiService } from '../../commercial/commercial-api.service';
import { CommercialFormat } from '../../commercial/commercial-format';
import { ReconciliationReport } from '../../commercial/commercial.models';
import { RouterLink } from '@angular/router';
import { LedgerContext } from '../ledger-context';

/**
 * Compares each subledger (open invoices, open bills, unapplied receipts and payments, deferred revenue) with
 * its control account in the general ledger. The result is stated in words, never only by colour.
 */
@Component({
  selector: 'app-reconciliation-report',
  imports: [RouterLink, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'commercial.reconciliation.title' | translate">
      <button type="button" class="btn btn-outline-secondary no-print" (click)="print()">{{ 'accounting.reports.print' | translate }}</button>
    </app-page-header>
    <p class="text-body-secondary">{{ 'commercial.reconciliation.intro' | translate }}</p>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (report(); as r) {
      <div id="recon-status" role="status" class="mb-3 fw-semibold" [class]="r.reconciled ? 'text-success' : 'text-danger'">
        @if (r.reconciled) {
          <span aria-hidden="true">&#10003; </span>{{ 'commercial.reconciliation.allOk' | translate }}
        } @else {
          <span aria-hidden="true">&#9888; </span>{{ 'commercial.reconciliation.notOk' | translate }}
        }
      </div>
      <ul class="list-unstyled" id="recon-sentences">
        @for (row of r.rows; track row.key) {
          <li class="mb-2" [id]="'recon-' + row.key">
            @if (row.unmapped) {
              {{ 'commercial.reconciliation.unmapped' | translate: { name: ('commercial.reconciliation.rows.' + row.key | translate) , mapping: ('commercial.mappings.keys.' + row.mapping | translate) } }}
            } @else if (row.reconciled) {
              <span aria-hidden="true">&#10003; </span>{{ 'commercial.reconciliation.rowOk' | translate: { name: ('commercial.reconciliation.rows.' + row.key | translate), sub: format.amount(row.subledger), control: format.amount(row.control) } }}
            } @else {
              <span aria-hidden="true">&#9888; </span>{{ 'commercial.reconciliation.rowDiff' | translate: { name: ('commercial.reconciliation.rows.' + row.key | translate), sub: format.amount(row.subledger), control: format.amount(row.control), diff: format.amount(abs(row.difference)) } }}
            }
          </li>
        }
      </ul>
      <div class="table-responsive">
        <table class="table table-sm align-middle report-table">
          <caption class="visually-hidden">{{ 'commercial.reconciliation.title' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'commercial.reconciliation.col.subledger' | translate }}</th>
              <th scope="col">{{ 'commercial.reconciliation.col.account' | translate }}</th>
              <th scope="col">{{ 'commercial.reconciliation.col.subledgerAmount' | translate }}</th>
              <th scope="col">{{ 'commercial.reconciliation.col.control' | translate }}</th>
              <th scope="col">{{ 'commercial.reconciliation.col.difference' | translate }}</th>
              <th scope="col">{{ 'commercial.docs.status' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of r.rows; track row.key) {
              <tr>
                <td>{{ 'commercial.reconciliation.rows.' + row.key | translate }}</td>
                <td dir="ltr" class="text-start">
                  @if (row.accountId) {
                    <a [routerLink]="['/app/accounting/reports/general-ledger']" [queryParams]="{ accountId: row.accountId }">{{ row.accountCode }}</a>
                  } @else {
                    -
                  }
                </td>
                <td dir="ltr" class="text-end">{{ format.amount(row.subledger) }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(row.control) }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(row.difference) }}</td>
                <td>{{ (row.unmapped ? 'commercial.reconciliation.status.unmapped' : row.reconciled ? 'commercial.reconciliation.status.ok' : 'commercial.reconciliation.status.diff') | translate }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class ReconciliationReportPage {
  protected readonly format = inject(CommercialFormat);
  protected readonly abs = abs;
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly report = signal<ReconciliationReport | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    inject(CommercialApiService)
      .reconciliation(this.ledgerId)
      .subscribe({ next: (r) => this.report.set(r), error: () => this.failed.set(true) });
  }

  protected print(): void {
    window.print();
  }
}
