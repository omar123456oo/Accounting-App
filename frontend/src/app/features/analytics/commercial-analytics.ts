import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { add, sum } from '../../core/money/money';
import { AGING_BUCKETS, AgingReport, Bill, Invoice, Side } from '../commercial/commercial.models';
import { BusinessClock, CommercialApiService } from '../commercial/commercial-api.service';
import { InvoicingApiService } from '../invoicing/invoicing-api.service';
import { PayablesApiService } from '../payables/payables-api.service';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, ColumnChart, KpiCard, StackBar, Tone } from './analytics-charts';
import { countBy, fetchAll, lastMonths, monthKey, pct, toNumber, topN } from './analytics.helpers';
import { watchLedger } from './ledger-analytics';

type Doc = Invoice | Bill;
const BUCKET_TONE: Record<string, Tone> = { current: 'success', d1_30: 'info', d31_60: 'warning', d61_90: 'danger', d90_plus: 'danger' };
const STATUS_TONE: Record<string, Tone> = { draft: 'secondary', pending_approval: 'warning', issued: 'info', approved: 'info', partially_paid: 'primary', paid: 'success', overdue: 'danger', cancelled: 'secondary', credited: 'secondary' };
const COUNTED = ['issued', 'approved', 'partially_paid', 'paid', 'overdue', 'credited'];

/**
 * Receivables (side "ar", invoices) or payables (side "ap", bills) of the selected ledger: how much is owed, how old it is,
 * who owes it, and how well it is being collected or paid.
 */
@Component({
  selector: 'app-commercial-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar, ColumnChart],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="file-invoice-dollar" [label]="'analytics.commercial.' + side() + '.total' | translate" [value]="f.money(d.total)" [hint]="'analytics.commercial.count' | translate: { n: d.count }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hand-holding-dollar" [label]="'analytics.commercial.' + side() + '.paid' | translate" [value]="f.pct(d.settlement)" [hint]="'analytics.commercial.settlementHint' | translate: { amount: f.money(d.paid) }" tone="success" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hourglass-half" [label]="'analytics.commercial.outstanding' | translate" [value]="f.money(d.outstanding)" [hint]="'analytics.commercial.outstandingHint' | translate" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="triangle-exclamation" [label]="'analytics.commercial.late' | translate" [value]="f.pct(d.lateShare)" [hint]="'analytics.commercial.lateHint' | translate: { amount: f.money(d.late) }" [tone]="d.lateShare ? 'danger' : 'success'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.commercial.aging' | translate"><app-bar-list [items]="d.aging" [label]="'analytics.commercial.aging' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.commercial.byStatus' | translate"><app-stack-bar [items]="d.byStatus" [label]="'analytics.commercial.byStatus' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.commercial.' + side() + '.top' | translate"><app-bar-list [items]="d.top" [label]="'analytics.commercial.' + side() + '.top' | translate" [empty]="'analytics.commercial.nothingOpen' | translate" />
          @if (d.concentration !== null) {
            <p class="small text-body-secondary mt-2 mb-0">{{ 'analytics.commercial.concentration' | translate: { pct: f.pct(d.concentration) } }}</p>
          }
        </app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.commercial.monthly' | translate"><app-column-chart [items]="d.monthly" [label]="'analytics.commercial.monthly' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class CommercialAnalytics {
  readonly side = input.required<Side>();
  protected readonly f = inject(AnalyticsFormat);
  private readonly commercial = inject(CommercialApiService);
  private readonly clock = inject(BusinessClock);
  private readonly invoices = inject(InvoicingApiService);
  private readonly bills = inject(PayablesApiService);
  protected readonly failed = signal(false);
  private readonly data = signal<{ docs: Doc[]; aging: AgingReport; today: string } | null>(null);

  protected readonly m = computed(() => {
    const r = this.data();
    if (!r) return null;
    const counted = r.docs.filter((d) => COUNTED.includes(d.status));
    const total = sum(counted.map((d) => d.total));
    const paid = sum(counted.map((d) => d.paid));
    const overdue = counted.filter((d) => d.status === 'overdue');
    const late = sum(overdue.map((d) => d.balance));
    const outstanding = r.aging.totals.total;
    const months = lastMonths(r.today.slice(0, 7), 6);
    const perMonth = Object.fromEntries(months.map((mo) => [mo, '0']));
    for (const d of counted) if (monthKey(d.date) in perMonth) perMonth[monthKey(d.date)] = add(perMonth[monthKey(d.date)], d.total);
    const status = countBy(r.docs, (d) => d.status);
    const top = topN(r.aging.rows, (x) => toNumber(x.total), 6);
    const topShare = pct(top.slice(0, 3).reduce((n, x) => n + toNumber(x.total), 0), toNumber(outstanding));
    return {
      count: counted.length,
      total,
      paid,
      settlement: pct(toNumber(paid), toNumber(total)),
      outstanding,
      late,
      lateShare: pct(toNumber(late), toNumber(outstanding)),
      aging: AGING_BUCKETS.map((b): ChartItem => ({ label: '', labelKey: 'commercial.aging.buckets.' + b, value: toNumber(r.aging.totals[b]), display: this.f.money(r.aging.totals[b]), tone: BUCKET_TONE[b] })),
      byStatus: Object.entries(status).map(([k, v]): ChartItem => ({ label: '', labelKey: 'commercial.status.' + k, value: v, tone: STATUS_TONE[k] ?? 'secondary' })),
      top: top.filter((x) => toNumber(x.total) > 0).map((x): ChartItem => ({ label: x.partyName, value: toNumber(x.total), display: this.f.money(x.total) })),
      concentration: top.length > 3 ? topShare : null,
      monthly: months.map((mo): ChartItem => ({ label: this.f.month(mo), value: toNumber(perMonth[mo]), display: this.f.compactMoney(perMonth[mo]) })),
    };
  });

  constructor() {
    watchLedger(
      (ledger) => {
        const side = this.side();
        const docs$ = side === 'ar' ? fetchAll((p) => this.invoices.list(ledger, { page: p, pageSize: 100 })) : fetchAll((p) => this.bills.list(ledger, { page: p, pageSize: 100 }));
        return forkJoin({ docs: docs$, aging: this.commercial.aging(ledger, side), today: this.clock.today(ledger) });
      },
      (d) => {
        this.data.set(d as never);
        this.failed.set(d === null);
      },
      () => {
        this.data.set(null);
        this.failed.set(false);
      },
    );
  }
}
