import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadCsv } from '../../clients/csv';
import { AccountingPeriod, JournalRegisterReport } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { ReportParams, ReportsApiService } from '../reports-api.service';
import { ReportBanner } from './report-banner';
import { registerCsv } from './report-csv';
import { ReportFilters } from './report-filters';

/** Every entry of the range in date order, with its total; links to the entry itself. */
@Component({
  selector: 'app-journal-register',
  imports: [TranslatePipe, RouterLink, PageHeader, ReportFilters, ReportBanner],
  templateUrl: './journal-register.html',
})
export class JournalRegisterPage {
  private readonly api = inject(ReportsApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(AccountingFormat);
  protected readonly ctx = inject(LedgerContext);
  private readonly ledgerId = this.ctx.activeId() as string;

  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly report = signal<JournalRegisterReport | null>(null);
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);

  constructor() {
    if (inject(AuthService).can('ledger.view')) inject(LedgerApiService).periods(this.ledgerId).subscribe({ next: (p) => this.periods.set(p), error: () => this.periods.set([]) });
  }

  protected run(params: ReportParams): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.journalRegister(this.ledgerId, params).subscribe({
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
    if (r) downloadCsv('journal-register.csv', registerCsv(r, this.format.ledgerLabel(this.ctx.active()), (k) => this.translate.instant(k)));
  }

  protected print(): void {
    window.print();
  }
}
