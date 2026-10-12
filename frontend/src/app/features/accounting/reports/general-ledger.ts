import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadCsv } from '../../clients/csv';
import { Account, AccountingPeriod, GeneralLedgerReport } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { AuthService } from '../../../core/auth/auth.service';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { ReportParams, ReportsApiService } from '../reports-api.service';
import { sideOf } from './balance';
import { ReportBanner } from './report-banner';
import { generalLedgerCsv } from './report-csv';
import { ReportFilters } from './report-filters';

/** General ledger of one account with a running balance; every row links to its source journal entry. */
@Component({
  selector: 'app-general-ledger',
  imports: [TranslatePipe, RouterLink, PageHeader, ReportFilters, ReportBanner],
  templateUrl: './general-ledger.html',
})
export class GeneralLedgerPage {
  private readonly api = inject(ReportsApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(AccountingFormat);
  protected readonly ctx = inject(LedgerContext);
  protected readonly side = sideOf;
  private readonly ledgerId = this.ctx.activeId() as string;
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly initial: ReportParams = { accountId: this.query.get('accountId') ?? undefined, from: this.query.get('from') ?? '', to: this.query.get('to') ?? '' };

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly report = signal<GeneralLedgerReport | null>(null);
  protected readonly params = signal<ReportParams>({});
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);

  constructor() {
    const ledger = inject(LedgerApiService);
    ledger.accounts(this.ledgerId).subscribe({ next: (a) => this.accounts.set(a), error: () => this.failed.set(true) });
    if (inject(AuthService).can('ledger.view')) ledger.periods(this.ledgerId).subscribe({ next: (p) => this.periods.set(p), error: () => this.periods.set([]) });
  }

  protected run(params: ReportParams): void {
    this.params.set(params);
    if (!params.accountId) return;
    this.loading.set(true);
    this.failed.set(false);
    this.api.generalLedger(this.ledgerId, params).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected exportCsv(): void {
    const r = this.report();
    if (r) downloadCsv('general-ledger.csv', generalLedgerCsv(r, this.format.ledgerLabel(this.ctx.active()), (k) => this.translate.instant(k), (a) => this.format.name(a)));
  }

  protected print(): void {
    window.print();
  }
}
