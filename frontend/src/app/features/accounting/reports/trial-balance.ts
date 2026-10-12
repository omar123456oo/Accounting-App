import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { abs, cmp, sub } from '../../../core/money/money';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadCsv } from '../../clients/csv';
import { AccountingPeriod, TrialBalanceReport } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { ReportParams, ReportsApiService } from '../reports-api.service';
import { sideOf } from './balance';
import { ReportBanner } from './report-banner';
import { trialBalanceCsv } from './report-csv';
import { ReportFilters } from './report-filters';

/** Trial balance from posted lines. Totals are re-added here with the money module and shown as a text reconciliation badge. */
@Component({
  selector: 'app-trial-balance',
  imports: [TranslatePipe, RouterLink, PageHeader, ReportFilters, ReportBanner],
  templateUrl: './trial-balance.html',
})
export class TrialBalancePage {
  private readonly api = inject(ReportsApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(AccountingFormat);
  protected readonly ctx = inject(LedgerContext);
  protected readonly side = sideOf;
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly initial: ReportParams = { from: this.query.get('from') ?? '', to: this.query.get('to') ?? '' };
  private readonly ledgerId = this.ctx.activeId() as string;

  protected readonly periods = signal<AccountingPeriod[]>([]);
  protected readonly report = signal<TrialBalanceReport | null>(null);
  protected readonly params = signal<ReportParams>({});
  protected readonly failed = signal(false);
  protected readonly loading = signal(false);

  protected readonly reconciled = computed(() => {
    const t = this.report()?.totals;
    return !!t && cmp(t.debit, t.credit) === 0 && cmp(t.closingDebit, t.closingCredit) === 0;
  });
  protected readonly difference = computed(() => {
    const t = this.report()?.totals;
    return t ? abs(sub(t.closingDebit, t.closingCredit)) : '0';
  });

  constructor() {
    if (inject(AuthService).can('ledger.view')) inject(LedgerApiService).periods(this.ledgerId).subscribe({ next: (p) => this.periods.set(p), error: () => this.periods.set([]) });
  }

  protected run(params: ReportParams): void {
    this.params.set(params);
    this.loading.set(true);
    this.failed.set(false);
    this.api.trialBalance(this.ledgerId, params).subscribe({
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
    if (r) downloadCsv('trial-balance.csv', trialBalanceCsv(r, this.format.ledgerLabel(this.ctx.active()), (k) => this.translate.instant(k), (a) => this.format.name(a)));
  }

  protected print(): void {
    window.print();
  }
}
