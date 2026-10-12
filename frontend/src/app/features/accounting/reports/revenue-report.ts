import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { toPlain } from '../../../core/money/money';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadCsv, toCsv } from '../../clients/csv';
import { CommercialApiService } from '../../commercial/commercial-api.service';
import { CommercialFormat } from '../../commercial/commercial-format';
import { RevenueBy, RevenueReport } from '../../commercial/commercial.models';
import { AccountingFormat } from '../accounting-format';
import { LedgerContext } from '../ledger-context';

const GROUPS: readonly RevenueBy[] = ['client', 'service', 'month'];

/** Revenue as booked by posted invoice journals, grouped by client, service or month. Drafts and unissued invoices are never included. */
@Component({
  selector: 'app-revenue-report',
  imports: [FormsModule, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'commercial.revenue.title' | translate">
      <button type="button" class="btn btn-outline-secondary no-print" [disabled]="!report()" (click)="exportCsv()">{{ 'accounting.reports.exportCsv' | translate }}</button>
      <button type="button" class="btn btn-outline-secondary no-print" [disabled]="!report()" (click)="print()">{{ 'accounting.reports.print' | translate }}</button>
    </app-page-header>
    <form class="row g-2 align-items-end mb-3 no-print" (submit)="run($event)">
      <div class="col-12 col-md-3">
        <label for="rev-by" class="form-label">{{ 'commercial.revenue.groupBy' | translate }}</label>
        <select id="rev-by" class="form-select" [ngModel]="by()" (ngModelChange)="by.set($event)" name="by">
          @for (g of groups; track g) {
            <option [value]="g">{{ 'commercial.revenue.by.' + g | translate }}</option>
          }
        </select>
      </div>
      <div class="col-6 col-md-3">
        <label for="rev-from" class="form-label">{{ 'accounting.journals.from' | translate }}</label>
        <input id="rev-from" type="date" class="form-control" [ngModel]="from()" (ngModelChange)="from.set($event)" name="from" />
      </div>
      <div class="col-6 col-md-3">
        <label for="rev-to" class="form-label">{{ 'accounting.journals.to' | translate }}</label>
        <input id="rev-to" type="date" class="form-control" [ngModel]="to()" (ngModelChange)="to.set($event)" name="to" />
      </div>
      <div class="col-auto"><button type="submit" class="btn btn-secondary">{{ 'accounting.reports.run' | translate }}</button></div>
    </form>
    <p class="print-only">{{ ledgerLabel() }}</p>
    <div class="alert alert-secondary py-2" role="status"><strong>{{ 'accounting.reports.postedOnly' | translate }}</strong> - {{ 'commercial.revenue.basis' | translate }}</div>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (report(); as r) {
      @if (r.rows.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'accounting.reports.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table table-sm align-middle report-table" id="revenue-table">
            <caption class="visually-hidden">{{ 'commercial.revenue.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.revenue.by.' + r.by | translate }}</th>
                <th scope="col">{{ 'commercial.revenue.amount' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of r.rows; track row.key) {
                <tr>
                  <td>{{ label(row) }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(row.amount) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr class="fw-bold">
                <th scope="row">{{ 'accounting.reports.totals' | translate }}</th>
                <td dir="ltr" class="text-end" id="revenue-total">{{ format.amount(r.total) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class RevenueReportPage {
  private readonly api = inject(CommercialApiService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  protected readonly format = inject(CommercialFormat);
  private readonly accountingFormat = inject(AccountingFormat);
  private readonly ctx = inject(LedgerContext);
  private readonly ledgerId = this.ctx.activeId() as string;
  protected readonly groups = GROUPS;
  protected readonly by = signal<RevenueBy>('client');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly report = signal<RevenueReport | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.fetch();
  }

  protected ledgerLabel(): string {
    return this.accountingFormat.ledgerLabel(this.ctx.active());
  }

  protected label(row: { label: string; labelAr?: string }): string {
    return this.language.current() === 'ar' && row.labelAr ? row.labelAr : row.label;
  }

  protected run(event: Event): void {
    event.preventDefault();
    this.fetch();
  }

  private fetch(): void {
    this.failed.set(false);
    this.api.revenue(this.ledgerId, this.by(), this.from(), this.to()).subscribe({ next: (r) => this.report.set(r), error: () => this.failed.set(true) });
  }

  protected exportCsv(): void {
    const r = this.report();
    if (!r) return;
    const t = (k: string) => this.translate.instant(k);
    downloadCsv('revenue.csv', toCsv(['', t('commercial.revenue.title')], [['', this.ledgerLabel()], ['', `${r.from || '-'} / ${r.to || '-'}`], [], [t(`commercial.revenue.by.${r.by}`), t('commercial.revenue.amount')], ...r.rows.map((x) => [this.label(x), toPlain(x.amount)]), [t('accounting.reports.totals'), toPlain(r.total)]]));
  }

  protected print(): void {
    window.print();
  }
}
