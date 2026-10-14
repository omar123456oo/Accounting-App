import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { rowValue } from '../analytics/statements-analytics';
import { AnalyticsFormat } from '../analytics/analytics-format';
import { BarList, ChartCard, ChartItem, KpiCard, LineChart, PieChart } from '../analytics/analytics-charts';
import { fetchAll, toNumber } from '../analytics/analytics.helpers';
import { watchLedger } from '../analytics/ledger-analytics';
import { LedgerContext } from '../accounting/ledger-context';
import { BusinessClock } from '../commercial/commercial-api.service';
import { HrApiService } from '../hr/hr-api.service';
import { InvoicingApiService } from '../invoicing/invoicing-api.service';
import { PayablesApiService } from '../payables/payables-api.service';
import { FsApiService } from '../reports-fs/fs-api.service';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { OpenItem, buildForecast } from './forecast';

const OPEN_STATUSES = ['issued', 'approved', 'partially_paid', 'overdue'];

const sumOf = (amounts: string[]): number => amounts.reduce((n, a) => n + toNumber(a), 0);

interface Source {
  today: string;
  openingCash: string;
  receivables: OpenItem[];
  payables: OpenItem[];
  payroll: string | null;
}

/** Thirteen weeks of expected cash for the selected ledger, from what is already open on the books plus clearly marked assumptions. */
@Component({
  selector: 'app-forecast-page',
  imports: [TranslatePipe, PageHeader, KpiCard, ChartCard, BarList, LineChart, PieChart],
  template: `
    <app-page-header [title]="'forecast.title' | translate" />
    <p class="text-body-secondary">{{ 'forecast.intro' | translate }}</p>

    <div class="d-flex flex-wrap gap-3 align-items-end mb-3">
      <div>
        <label for="fc-ledger" class="form-label">{{ 'analytics.ledger' | translate }}</label>
        <select id="fc-ledger" class="form-select" [value]="ledgers.activeId() ?? ''" (change)="ledgers.select($any($event.target).value)">
          @for (e of ledgers.entities(); track e.id) {
            <option [value]="e.id">{{ e.name }}</option>
          }
        </select>
      </div>
      <div>
        <label for="fc-rate" class="form-label">{{ 'forecast.rate' | translate }}</label>
        <input id="fc-rate" type="number" min="0" max="100" class="form-control" dir="ltr" [value]="rate()" (input)="rate.set(clamp($any($event.target).value, 0, 100))" />
      </div>
      <div>
        <label for="fc-delay" class="form-label">{{ 'forecast.delay' | translate }}</label>
        <input id="fc-delay" type="number" min="0" max="90" class="form-control" dir="ltr" [value]="delay()" (input)="delay.set(clamp($any($event.target).value, 0, 90))" />
      </div>
      @if (src()?.payroll) {
        <div class="form-check form-switch mb-2">
          <input id="fc-payroll" type="checkbox" role="switch" class="form-check-input" [checked]="payroll()" (change)="payroll.set($any($event.target).checked)" />
          <label for="fc-payroll" class="form-check-label">{{ 'forecast.payroll' | translate }}</label>
        </div>
      }
    </div>

    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (view(); as v) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="vault" [label]="'forecast.opening' | translate" [value]="f.money(v.opening)" [hint]="'forecast.openingHint' | translate" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="arrow-trend-up" [label]="'forecast.closing' | translate" [value]="f.money(v.closing)" [hint]="'forecast.closingHint' | translate" [tone]="v.closingNegative ? 'danger' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="arrow-down-long" [label]="'forecast.lowest' | translate" [value]="f.money(v.lowest)" [hint]="'forecast.lowestHint' | translate: { week: v.lowestWeek }" [tone]="v.lowestNegative ? 'danger' : 'body'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="triangle-exclamation" [label]="'forecast.shortfall' | translate" [value]="v.shortfallWeek ?? ('forecast.none' | translate)" [hint]="'forecast.shortfallHint' | translate" [tone]="v.shortfallWeek ? 'danger' : 'success'" /></div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-8"><app-chart-card [title]="'forecast.closingByWeek' | translate"><app-line-chart [items]="v.closingLine" [label]="'forecast.closingByWeek' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-4"><app-chart-card [title]="'forecast.mix' | translate"><app-pie-chart [items]="v.mix" [label]="'forecast.mix' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-12"><app-chart-card [title]="'forecast.netByWeek' | translate"><app-bar-list [items]="v.netBars" [label]="'forecast.netByWeek' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
      </div>

      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <caption class="visually-hidden">{{ 'forecast.title' | translate }}</caption>
          <thead><tr><th scope="col">{{ 'forecast.week' | translate }}</th><th scope="col" class="text-end">{{ 'forecast.in' | translate }}</th><th scope="col" class="text-end">{{ 'forecast.out' | translate }}</th><th scope="col" class="text-end">{{ 'forecast.net' | translate }}</th><th scope="col" class="text-end">{{ 'forecast.closing' | translate }}</th></tr></thead>
          <tbody>
            @for (w of v.rows; track w.start) {
              <tr [class.table-danger]="w.negative">
                <td>{{ w.label }}</td>
                <td class="text-end" dir="ltr">{{ f.money(w.inflow) }}</td>
                <td class="text-end" dir="ltr">{{ f.money(w.outflow) }}</td>
                <td class="text-end" dir="ltr">{{ f.money(w.net) }}</td>
                <td class="text-end fw-semibold" dir="ltr">{{ f.money(w.closing) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="alert alert-secondary small" role="note">
        {{ 'forecast.assumptions' | translate: { rate: rate(), delay: delay() } }}
        @if (v.beyond) {
          {{ 'forecast.beyond' | translate: { in: f.money(v.beyondIn), out: f.money(v.beyondOut) } }}
        }
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class ForecastPage {
  protected readonly f = inject(AnalyticsFormat);
  protected readonly ledgers = inject(LedgerContext);
  private readonly auth = inject(AuthService);
  private readonly clock = inject(BusinessClock);
  private readonly invoices = inject(InvoicingApiService);
  private readonly bills = inject(PayablesApiService);
  private readonly fs = inject(FsApiService);
  private readonly hr = inject(HrApiService);
  protected readonly failed = signal(false);
  protected readonly src = signal<Source | null>(null);
  protected readonly rate = signal(90);
  protected readonly delay = signal(30);
  protected readonly payroll = signal(true);

  protected readonly view = computed(() => {
    const s = this.src();
    if (!s) return null;
    const fc = buildForecast({ today: s.today, openingCash: s.openingCash, receivables: s.receivables, payables: s.payables, payrollMonthly: this.payroll() ? s.payroll : null, collectionRate: this.rate(), overdueDelayDays: this.delay(), weeks: 13 });
    const label = (w: { start: string; end: string }) => `${w.start.slice(5)} → ${w.end.slice(5)}`;
    const last = fc.weeks[fc.weeks.length - 1];
    return {
      opening: s.openingCash,
      closing: last.closing,
      closingNegative: toNumber(last.closing) < 0,
      lowest: fc.lowest.closing,
      lowestNegative: toNumber(fc.lowest.closing) < 0,
      lowestWeek: label(fc.lowest),
      shortfallWeek: fc.shortfall ? label(fc.shortfall) : null,
      closingLine: fc.weeks.map((w): ChartItem => ({ label: w.start.slice(5), value: toNumber(w.closing), display: this.f.money(w.closing) })),
      mix: [
        { label: '', labelKey: 'forecast.mixIn', value: sumOf(fc.weeks.map((w) => w.inflow)), display: this.f.money(sumOf(fc.weeks.map((w) => w.inflow)).toFixed(2)), tone: 'success' },
        { label: '', labelKey: 'forecast.mixOut', value: sumOf(fc.weeks.map((w) => w.outflow)), display: this.f.money(sumOf(fc.weeks.map((w) => w.outflow)).toFixed(2)), tone: 'danger' },
      ] as ChartItem[],
      netBars: fc.weeks.map((w): ChartItem => ({ label: label(w), value: Math.abs(toNumber(w.net)), display: this.f.money(w.net), tone: toNumber(w.net) < 0 ? 'danger' : 'success' })),
      rows: fc.weeks.map((w) => ({ ...w, label: label(w), negative: toNumber(w.closing) < 0 })),
      beyond: toNumber(fc.beyondHorizon.receivables) > 0 || toNumber(fc.beyondHorizon.payables) > 0,
      beyondIn: fc.beyondHorizon.receivables,
      beyondOut: fc.beyondHorizon.payables,
    };
  });

  constructor() {
    this.ledgers.load();
    watchLedger(
      (ledger) =>
        this.clock.today(ledger).pipe(
          switchMap((today) =>
            forkJoin({
              today: of(today),
              balance: this.fs.statement(ledger, 'balance', { from: `${today.slice(0, 4)}-01-01`, to: today }),
              invoices: fetchAll((p) => this.invoices.list(ledger, { page: p, pageSize: 100 })),
              bills: fetchAll((p) => this.bills.list(ledger, { page: p, pageSize: 100 })),
              payroll: this.latestPayroll(),
            }),
          ),
        ),
      (d) => {
        this.failed.set(d === null);
        this.src.set(
          d && {
            today: d.today,
            openingCash: rowValue(d.balance, 'bs.cash'),
            receivables: d.invoices.filter((x) => OPEN_STATUSES.includes(x.status) && toNumber(x.balance) > 0).map((x) => ({ dueDate: x.dueDate, balance: x.balance })),
            payables: d.bills.filter((x) => OPEN_STATUSES.includes(x.status) && toNumber(x.balance) > 0).map((x) => ({ dueDate: x.dueDate, balance: x.balance })),
            payroll: d.payroll,
          },
        );
      },
      () => {
        this.src.set(null);
        this.failed.set(false);
      },
    );
  }

  /** Net pay of the latest finalised run, for people who may see payroll. */
  private latestPayroll() {
    if (!this.auth.can('payroll.view')) return of(null);
    return this.hr.runs().pipe(
      switchMap((runs) => {
        const last = runs.find((r) => r.status === 'final');
        return last ? of(last.net) : of(null);
      }),
      catchError(() => of(null)),
    );
  }

  protected clamp(value: string, lo: number, hi: number): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
  }
}
