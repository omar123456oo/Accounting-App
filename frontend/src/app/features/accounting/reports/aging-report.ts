import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { toPlain } from '../../../core/money/money';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { CommercialApiService } from '../../commercial/commercial-api.service';
import { CommercialFormat } from '../../commercial/commercial-format';
import { AGING_BUCKETS, AgingReport, AgingRow, Side } from '../../commercial/commercial.models';
import { downloadCsv, toCsv } from '../../clients/csv';
import { AccountingFormat } from '../accounting-format';
import { LedgerContext } from '../ledger-context';

/**
 * Receivables or payables aging by the due date against the mock clock (or a chosen date): current, 1-30, 31-60,
 * 61-90 and over 90 days. Each party expands to its documents; every document links to its page.
 */
@Component({
  selector: 'app-aging-report',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader, StatusBadge],
  template: `
    <app-page-header [title]="'commercial.aging.' + side + '.title' | translate">
      <button type="button" class="btn btn-outline-secondary no-print" [disabled]="!report()" (click)="exportCsv()">{{ 'accounting.reports.exportCsv' | translate }}</button>
      <button type="button" class="btn btn-outline-secondary no-print" [disabled]="!report()" (click)="print()">{{ 'accounting.reports.print' | translate }}</button>
    </app-page-header>
    <form class="row g-2 align-items-end mb-3 no-print" (submit)="run($event)">
      <div class="col-6 col-md-3">
        <label for="aging-asof" class="form-label">{{ 'commercial.aging.asOf' | translate }}</label>
        <input id="aging-asof" type="date" class="form-control" [ngModel]="asOf()" (ngModelChange)="asOf.set($event)" name="asOf" />
      </div>
      <div class="col-auto"><button type="submit" class="btn btn-secondary">{{ 'accounting.reports.run' | translate }}</button></div>
    </form>
    <p class="print-only">{{ ledgerLabel() }}</p>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (report(); as r) {
      <div class="alert alert-secondary py-2" role="status">{{ 'commercial.aging.basis' | translate: { date: format.date(r.asOf) } }}</div>
      @if (r.rows.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.aging.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table table-sm align-middle report-table" id="aging-table">
            <caption class="visually-hidden">{{ 'commercial.aging.' + side + '.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.docs.col.' + side + 'Party' | translate }}</th>
                @for (b of buckets; track b) {
                  <th scope="col">{{ 'commercial.aging.buckets.' + b | translate }}</th>
                }
                <th scope="col">{{ 'commercial.docs.col.total' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of r.rows; track row.partyId) {
                <tr>
                  <td>
                    <button type="button" class="btn btn-link p-0 text-decoration-none no-print" [attr.aria-expanded]="isOpen(row.partyId)" [attr.aria-controls]="'aging-items-' + row.partyId" (click)="toggle(row.partyId)">
                      <span aria-hidden="true">{{ isOpen(row.partyId) ? '▾' : '▸' }}</span>
                      {{ row.partyName }}<span class="visually-hidden"> - {{ 'commercial.aging.showDocuments' | translate }}</span>
                    </button>
                    <span class="print-only">{{ row.partyName }}</span>
                  </td>
                  @for (b of buckets; track b) {
                    <td dir="ltr" class="text-end">{{ format.amount(row[b]) }}</td>
                  }
                  <td dir="ltr" class="text-end fw-semibold">{{ format.amount(row.total) }}</td>
                </tr>
                @if (isOpen(row.partyId)) {
                  @for (item of row.items; track item.docId) {
                    <tr class="table-light" [id]="'aging-items-' + row.partyId">
                      <td colspan="7">
                        <a [routerLink]="[docBase, item.docId]">{{ item.reference }}</a>
                        - {{ 'commercial.docs.dueOn' | translate: { date: format.date(item.dueDate) } }}
                        - {{ 'commercial.aging.daysPast' | translate: { days: item.daysPastDue } }}
                        - <app-status-badge [label]="'commercial.aging.buckets.' + item.bucket | translate" tone="secondary" />
                        - <span dir="ltr">{{ format.amount(item.balance) }}</span>
                      </td>
                    </tr>
                  }
                }
              }
            </tbody>
            <tfoot>
              <tr class="fw-bold">
                <th scope="row">{{ 'accounting.reports.totals' | translate }}</th>
                @for (b of buckets; track b) {
                  <td dir="ltr" class="text-end" [id]="'aging-total-' + b">{{ format.amount(r.totals[b]) }}</td>
                }
                <td dir="ltr" class="text-end" id="aging-total">{{ format.amount(r.totals.total) }}</td>
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
export class AgingReportPage {
  private readonly api = inject(CommercialApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(CommercialFormat);
  private readonly accountingFormat = inject(AccountingFormat);
  private readonly ctx = inject(LedgerContext);
  private readonly ledgerId = this.ctx.activeId() as string;
  protected readonly side = inject(ActivatedRoute).snapshot.data['side'] as Side;
  protected readonly docBase = this.side === 'ar' ? '/app/invoicing/invoices' : '/app/payables/bills';
  protected readonly buckets = AGING_BUCKETS;
  protected readonly asOf = signal('');
  protected readonly report = signal<AgingReport | null>(null);
  protected readonly failed = signal(false);
  private readonly open = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.fetch();
  }

  protected ledgerLabel(): string {
    return this.accountingFormat.ledgerLabel(this.ctx.active());
  }

  protected isOpen(id: string): boolean {
    return this.open().has(id);
  }

  protected toggle(id: string): void {
    const next = new Set(this.open());
    if (!next.delete(id)) next.add(id);
    this.open.set(next);
  }

  protected run(event: Event): void {
    event.preventDefault();
    this.fetch();
  }

  private fetch(): void {
    this.failed.set(false);
    this.api.aging(this.ledgerId, this.side, this.asOf()).subscribe({ next: (r) => this.report.set(r), error: () => this.failed.set(true) });
  }

  protected exportCsv(): void {
    const r = this.report();
    if (!r) return;
    const t = (k: string) => this.translate.instant(k);
    const header = [`commercial.docs.col.${this.side}Party`, ...AGING_BUCKETS.map((b) => `commercial.aging.buckets.${b}`), 'commercial.docs.col.total'].map(t);
    const line = (name: string, x: Pick<AgingRow, 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus' | 'total'>) => [name, ...AGING_BUCKETS.map((b) => toPlain(x[b])), toPlain(x.total)];
    const rows = [...r.rows.map((row) => line(row.partyName, row)), line(t('accounting.reports.totals'), r.totals)];
    downloadCsv(`${this.side}-aging.csv`, toCsv(['', t(`commercial.aging.${this.side}.title`)], [['', this.ledgerLabel()], ['', r.asOf], [], header, ...rows]));
  }

  protected print(): void {
    window.print();
  }
}
