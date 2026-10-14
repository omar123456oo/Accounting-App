import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin, switchMap } from 'rxjs';
import { abs, isZero } from '../../core/money/money';
import { StatementView } from '../reports-fs/fs.models';
import { FsApiService } from '../reports-fs/fs-api.service';
import { BusinessClock } from '../commercial/commercial-api.service';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, KpiCard, StackBar } from './analytics-charts';
import { pct, toNumber } from './analytics.helpers';
import { watchLedger } from './ledger-analytics';

/** The value of a statement row by key, or "0" when the statement does not carry it. */
export function rowValue(view: StatementView, key: string): string {
  for (const s of view.sections) {
    const row = s.rows.find((r) => r.key === key);
    if (row) return row.values[0] ?? '0';
  }
  return '0';
}

/** Margins and balance-sheet ratios for the year to date. Figures include posted entries only. */
@Component({
  selector: 'app-statements-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <p class="small text-body-secondary">{{ 'analytics.statements.period' | translate: { from: d.from, to: d.to } }}</p>
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="chart-line" [label]="'analytics.statements.revenue' | translate" [value]="f.money(d.revenue)" [hint]="'analytics.statements.revenueHint' | translate" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="percent" [label]="'analytics.statements.grossMargin' | translate" [value]="f.pct(d.grossMargin)" [hint]="'analytics.statements.grossHint' | translate: { amount: f.money(d.gross) }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="coins" [label]="'analytics.statements.netResult' | translate" [value]="f.money(d.net)" [hint]="'analytics.statements.netMargin' | translate: { pct: f.pct(d.netMargin) }" [tone]="d.netNegative ? 'danger' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="scale-unbalanced" [label]="'analytics.statements.leverage' | translate" [value]="d.leverage === null ? '—' : d.leverage.toFixed(2)" [hint]="'analytics.statements.leverageHint' | translate" [tone]="(d.leverage ?? 0) > 2 ? 'warning' : 'body'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.statements.costs' | translate"><app-bar-list [items]="d.costs" [label]="'analytics.statements.costs' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.statements.structure' | translate"><app-stack-bar [items]="d.structure" [label]="'analytics.statements.structure' | translate" [empty]="'analytics.noData' | translate" />
          <p class="small mt-2 mb-0" [class.text-danger]="!d.reconciled">{{ (d.reconciled ? 'analytics.statements.reconciled' : 'analytics.statements.notReconciled') | translate }}</p>
        </app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.statements.liquidity' | translate"><app-bar-list [items]="d.liquidity" [label]="'analytics.statements.liquidity' | translate" [empty]="'analytics.noData' | translate" />
          <p class="small text-body-secondary mt-2 mb-0">{{ 'analytics.statements.currentRatio' | translate: { ratio: d.currentRatio === null ? '—' : d.currentRatio.toFixed(2) } }}</p>
        </app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class StatementsAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly fs = inject(FsApiService);
  private readonly clock = inject(BusinessClock);
  protected readonly failed = signal(false);
  private readonly data = signal<{ income: StatementView; balance: StatementView } | null>(null);

  protected readonly m = computed(() => {
    const r = this.data();
    if (!r) return null;
    const i = (k: string) => rowValue(r.income, k);
    const b = (k: string) => rowValue(r.balance, k);
    const revenue = i('is.revenue');
    const net = i('net');
    const liabilities = b('total_liabilities');
    const equity = b('total_equity');
    const currentLiabilities = Number(b('bs.payables')) + Number(b('bs.other_current_liabilities'));
    const item = (labelKey: string, v: string): ChartItem => ({ label: '', labelKey, value: Math.abs(toNumber(v)), display: this.f.money(v) });
    return {
      from: r.income.from,
      to: r.income.to,
      revenue,
      gross: i('gross'),
      grossMargin: pct(toNumber(i('gross')), toNumber(revenue)),
      net,
      netNegative: toNumber(net) < 0,
      netMargin: pct(toNumber(net), toNumber(revenue)),
      leverage: isZero(equity) ? null : toNumber(liabilities) / toNumber(equity),
      currentRatio: currentLiabilities === 0 ? null : toNumber(b('current_assets')) / currentLiabilities,
      costs: [item('analytics.statements.cost', i('is.cost_of_revenue')), item('analytics.statements.opex', i('is.operating_expenses')), item('analytics.statements.depreciation', i('is.depreciation')), item('analytics.statements.otherExpenses', i('is.other_expenses'))].filter((x) => x.value > 0),
      structure: [
        { label: '', labelKey: 'analytics.statements.liabilities', value: Math.abs(toNumber(liabilities)), display: this.f.money(abs(liabilities)), tone: 'warning' as const },
        { label: '', labelKey: 'analytics.statements.equity', value: Math.abs(toNumber(equity)), display: this.f.money(abs(equity)), tone: 'success' as const },
      ].filter((x) => x.value > 0),
      reconciled: r.balance.check.reconciled,
      liquidity: [item('analytics.statements.cash', b('bs.cash')), item('analytics.statements.receivables', b('bs.receivables')), item('analytics.statements.payables', b('bs.payables'))].filter((x) => x.value > 0),
    };
  });

  constructor() {
    watchLedger(
      (ledger) =>
        this.clock.today(ledger).pipe(
          // Year to date, in the ledger's own business time.
          switchMap((today) => {
            const params = { from: `${today.slice(0, 4)}-01-01`, to: today };
            return forkJoin({ income: this.fs.statement(ledger, 'income', params), balance: this.fs.statement(ledger, 'balance', params) });
          }),
        ),
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
