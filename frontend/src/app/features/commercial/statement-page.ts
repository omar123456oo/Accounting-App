import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { AccountingFormat } from '../accounting/accounting-format';
import { LedgerContext } from '../accounting/ledger-context';
import { downloadCsv } from '../clients/csv';
import { CommercialApiService } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { Side, Statement } from './commercial.models';
import { statementCsv } from './statement-csv';

/** A customer or supplier statement for a date range: opening balance, movements, running balance. Printable, and exportable as CSV. */
@Component({
  selector: 'app-statement-page',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'commercial.statement.' + side + '.title' | translate">
      <button type="button" class="btn btn-outline-secondary no-print" [disabled]="!report()" (click)="exportCsv()">{{ 'accounting.reports.exportCsv' | translate }}</button>
      <button type="button" class="btn btn-outline-secondary no-print" [disabled]="!report()" (click)="print()">{{ 'accounting.reports.print' | translate }}</button>
    </app-page-header>
    <form class="row g-2 align-items-end mb-3 no-print" (submit)="run($event)">
      <div class="col-6 col-md-3">
        <label for="st-from" class="form-label">{{ 'accounting.journals.from' | translate }}</label>
        <input id="st-from" type="date" class="form-control" [ngModel]="from()" (ngModelChange)="from.set($event)" name="from" />
      </div>
      <div class="col-6 col-md-3">
        <label for="st-to" class="form-label">{{ 'accounting.journals.to' | translate }}</label>
        <input id="st-to" type="date" class="form-control" [ngModel]="to()" (ngModelChange)="to.set($event)" name="to" />
      </div>
      <div class="col-auto"><button type="submit" class="btn btn-secondary">{{ 'accounting.reports.run' | translate }}</button></div>
      <div class="col-auto"><a [routerLink]="backLink">{{ 'commercial.statement.back' | translate }}</a></div>
    </form>
    <p class="print-only">{{ ledgerLabel() }}</p>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (report(); as r) {
      <h2 class="h5">{{ r.party.name }}@if (r.party.taxRegistrationNo) { <span class="small text-body-secondary" dir="ltr"> ({{ r.party.taxRegistrationNo }})</span> }</h2>
      <p class="text-body-secondary">{{ 'commercial.statement.period' | translate: { from: r.from ? format.date(r.from) : '-', to: format.date(r.to) } }}</p>
      <div class="table-responsive">
        <table class="table table-sm align-middle report-table" id="statement-table">
          <caption class="visually-hidden">{{ 'commercial.statement.' + side + '.title' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'accounting.reports.col.date' | translate }}</th>
              <th scope="col">{{ 'commercial.statement.type' | translate }}</th>
              <th scope="col">{{ 'accounting.reports.col.reference' | translate }}</th>
              <th scope="col">{{ 'accounting.reports.col.description' | translate }}</th>
              <th scope="col">{{ 'commercial.statement.cols.' + side + 'Debit' | translate }}</th>
              <th scope="col">{{ 'commercial.statement.cols.' + side + 'Credit' | translate }}</th>
              <th scope="col">{{ 'accounting.reports.col.balance' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr class="fw-semibold">
              <td colspan="6">{{ 'accounting.reports.opening' | translate }}</td>
              <td dir="ltr" class="text-end" id="statement-opening">{{ format.amount(r.openingBalance) }}</td>
            </tr>
            @for (l of r.lines; track $index) {
              <tr>
                <td>{{ format.date(l.date) }}</td>
                <td>{{ 'commercial.statement.kinds.' + l.kind | translate }}</td>
                <td dir="ltr" class="text-start">{{ l.reference }}</td>
                <td>{{ l.description }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(l.debit) }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(l.credit) }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(l.balance) }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr class="fw-bold">
              <th scope="row" colspan="6">{{ 'accounting.reports.closing' | translate }}</th>
              <td dir="ltr" class="text-end" id="statement-closing">{{ format.amount(r.closingBalance) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p id="statement-unapplied" class="text-body-secondary">{{ 'commercial.statement.' + side + '.unapplied' | translate: { amount: format.amount(r.unapplied) } }}</p>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class StatementPage {
  private readonly api = inject(CommercialApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(CommercialFormat);
  private readonly accountingFormat = inject(AccountingFormat);
  private readonly ctx = inject(LedgerContext);
  private readonly ledgerId = this.ctx.activeId() as string;
  private readonly route = inject(ActivatedRoute);
  protected readonly side = this.route.snapshot.data['side'] as Side;
  private readonly partyId = this.route.snapshot.paramMap.get('partyId') as string;
  protected readonly backLink = this.side === 'ar' ? '/app/invoicing/customers' : '/app/payables/suppliers';
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly report = signal<Statement | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.fetch();
  }

  protected ledgerLabel(): string {
    return this.accountingFormat.ledgerLabel(this.ctx.active());
  }

  protected run(event: Event): void {
    event.preventDefault();
    this.fetch();
  }

  private fetch(): void {
    this.failed.set(false);
    this.api.statement(this.ledgerId, this.side, this.partyId, this.from(), this.to()).subscribe({ next: (r) => this.report.set(r), error: () => this.failed.set(true) });
  }

  protected exportCsv(): void {
    const r = this.report();
    if (r) downloadCsv(`statement-${r.party.name.replace(/\s+/g, '-')}.csv`, statementCsv(r, this.ledgerLabel(), (k) => this.translate.instant(k)));
  }

  protected print(): void {
    window.print();
  }
}

