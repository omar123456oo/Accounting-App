import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { JOURNAL_STATUSES, JournalEntry, TrialBalanceReport } from '../accounting/accounting.models';
import { JournalsApiService } from '../accounting/journals-api.service';
import { ReportsApiService } from '../accounting/reports-api.service';
import { LanguageService } from '../../core/i18n/language.service';
import { cmp } from '../../core/money/money';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard, StackBar, Tone } from './analytics-charts';
import { countBy, fetchAll, lastMonths, monthKey, toNumber, todayIso, topN } from './analytics.helpers';
import { watchLedger } from './ledger-analytics';

const TONE: Record<string, Tone> = { draft: 'secondary', pending_approval: 'warning', approved: 'info', posted: 'success', reversed: 'danger' };

/** The books of the selected ledger: entry flow, approval backlog and where the balances sit. */
@Component({
  selector: 'app-accounting-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar, ColumnChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="pen-to-square" [label]="'analytics.accounting.entries' | translate" [value]="f.int(d.total)" [hint]="'analytics.accounting.postedHint' | translate: { n: d.posted }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hourglass-half" [label]="'analytics.accounting.backlog' | translate" [value]="f.int(d.backlog)" [hint]="'analytics.accounting.backlogHint' | translate" [tone]="d.backlog ? 'warning' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="scale-balanced" [label]="'analytics.accounting.turnover' | translate" [value]="f.money(d.debit)" [hint]="'analytics.accounting.turnoverHint' | translate" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="circle-check" [label]="'analytics.accounting.balanced' | translate" [value]="(d.balanced ? 'analytics.yes' : 'analytics.no') | translate" [hint]="d.balanced ? ('analytics.accounting.balancedHint' | translate) : ('analytics.accounting.diff' | translate: { n: f.money(d.difference) })" [tone]="d.balanced ? 'success' : 'danger'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.accounting.byStatus' | translate"><app-stack-bar [items]="d.byStatus" [label]="'analytics.accounting.byStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.accounting.perMonth' | translate"><app-column-chart [items]="d.perMonth" [label]="'analytics.accounting.perMonth' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.accounting.topDebit' | translate"><app-bar-list [items]="d.topDebit" [label]="'analytics.accounting.topDebit' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.accounting.topCredit' | translate"><app-bar-list [items]="d.topCredit" [label]="'analytics.accounting.topCredit' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class AccountingAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly lang = inject(LanguageService);
  private readonly journals = inject(JournalsApiService);
  private readonly reports = inject(ReportsApiService);
  protected readonly failed = signal(false);
  private readonly data = signal<{ entries: JournalEntry[]; tb: TrialBalanceReport } | null>(null);

  protected readonly m = computed(() => {
    const r = this.data();
    if (!r) return null;
    const status = countBy(r.entries, (e) => e.status, JOURNAL_STATUSES);
    const months = lastMonths(monthKey(todayIso()), 6);
    const perMonth = countBy(r.entries.filter((e) => e.status === 'posted'), (e) => monthKey(e.postingDate), months);
    const name = (row: TrialBalanceReport['rows'][number]) => `${row.code} ${this.lang.current() === 'ar' ? row.nameAr : row.nameEn}`;
    const item = (row: TrialBalanceReport['rows'][number], amount: string): ChartItem => ({ label: name(row), value: toNumber(amount), display: this.f.money(amount) });
    return {
      total: r.entries.length,
      posted: status['posted'],
      backlog: status['pending_approval'] + status['approved'],
      debit: r.tb.totals.debit,
      balanced: r.tb.balanced,
      difference: r.tb.difference,
      byStatus: JOURNAL_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'analytics.accounting.status.' + s, value: status[s], tone: TONE[s] })),
      perMonth: months.map((mo): ChartItem => ({ label: this.f.month(mo), value: perMonth[mo] })),
      topDebit: topN(r.tb.rows.filter((x) => cmp(x.closingDebit, '0') > 0), (x) => toNumber(x.closingDebit), 6).map((x) => item(x, x.closingDebit)),
      topCredit: topN(r.tb.rows.filter((x) => cmp(x.closingCredit, '0') > 0), (x) => toNumber(x.closingCredit), 6).map((x) => item(x, x.closingCredit)),
    };
  });

  constructor() {
    watchLedger(
      (ledger) => forkJoin({ entries: fetchAll((p) => this.journals.list(ledger, { page: p, pageSize: 100 })), tb: this.reports.trialBalance(ledger, { includeUnposted: false }) }),
      (d) => {
        this.data.set(d);
        this.failed.set(d === null);
      },
      () => {
        this.data.set(null);
        this.failed.set(false);
      },
    );
  }
}
