import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DOCUMENT_CATEGORIES, DocumentRecord, REVIEW_STATUSES } from '../documents/documents.models';
import { DocumentsApiService } from '../documents/documents-api.service';
import { AnalyticsFormat } from './analytics-format';
import { BarList, ChartCard, ChartItem, KpiCard, StackBar, Tone } from './analytics-charts';
import { countBy, fetchAll, pct, topN } from './analytics.helpers';

const REVIEW_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger' };

/** Document control: what waits for review, what is rejected, and which files are about to expire. */
@Component({
  selector: 'app-documents-analytics',
  imports: [TranslatePipe, KpiCard, ChartCard, BarList, StackBar],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (m(); as d) {
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-kpi-card icon="file-lines" [label]="'analytics.documents.total' | translate" [value]="f.int(d.total)" [hint]="'analytics.documents.versions' | translate: { n: f.int(d.versions) }" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="hourglass-half" [label]="'analytics.documents.pending' | translate" [value]="f.int(d.pending)" [hint]="'analytics.documents.pendingHint' | translate: { pct: f.pct(d.pendingShare) }" [tone]="d.pending ? 'warning' : 'success'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="circle-xmark" [label]="'analytics.documents.rejectionRate' | translate" [value]="f.pct(d.rejectionRate)" [hint]="'analytics.documents.rejectionHint' | translate" [tone]="(d.rejectionRate ?? 0) > 20 ? 'danger' : 'body'" /></div>
        <div class="col-6 col-lg-3"><app-kpi-card icon="calendar-xmark" [label]="'analytics.documents.expiry' | translate" [value]="f.int(d.expiring + d.expired)" [hint]="'analytics.documents.expiryHint' | translate: { soon: d.expiring, gone: d.expired }" [tone]="d.expired ? 'danger' : d.expiring ? 'warning' : 'success'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-6"><app-chart-card [title]="'analytics.documents.byReview' | translate"><app-stack-bar [items]="d.byReview" [label]="'analytics.documents.byReview' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.documents.byCategory' | translate"><app-bar-list [items]="d.byCategory" [label]="'analytics.documents.byCategory' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.documents.topClients' | translate"><app-bar-list [items]="d.topClients" [label]="'analytics.documents.topClients' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
        <div class="col-lg-6"><app-chart-card [title]="'analytics.documents.byYear' | translate"><app-bar-list [items]="d.byYear" [label]="'analytics.documents.byYear' | translate" [empty]="'analytics.noData' | translate" /></app-chart-card></div>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class DocumentsAnalytics {
  protected readonly f = inject(AnalyticsFormat);
  private readonly api = inject(DocumentsApiService);
  protected readonly failed = signal(false);
  private readonly rows = signal<DocumentRecord[] | null>(null);

  protected readonly m = computed(() => {
    const docs = this.rows();
    if (!docs) return null;
    const review = countBy(docs, (d) => d.reviewStatus, REVIEW_STATUSES);
    const decided = review['approved'] + review['rejected'];
    const perClient = countBy(docs, (d) => d.clientName);
    return {
      total: docs.length,
      versions: docs.reduce((n, d) => n + d.currentVersion, 0),
      pending: review['pending'],
      pendingShare: pct(review['pending'], docs.length),
      rejectionRate: pct(review['rejected'], decided),
      expiring: docs.filter((d) => d.expiryState === 'expiring_soon').length,
      expired: docs.filter((d) => d.expiryState === 'expired').length,
      byReview: REVIEW_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'documents.review.' + s, value: review[s], tone: REVIEW_TONE[s] })),
      byCategory: Object.entries(countBy(docs, (d) => d.category, DOCUMENT_CATEGORIES)).map(([k, v]): ChartItem => ({ label: '', labelKey: 'documents.category.' + k, value: v })),
      topClients: topN(Object.entries(perClient), ([, v]) => v, 6).map(([k, v]): ChartItem => ({ label: k, value: v })),
      byYear: Object.entries(countBy(docs, (d) => String(d.year)))
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([k, v]): ChartItem => ({ label: k, value: v })),
    };
  });

  constructor() {
    fetchAll((p) => this.api.list({ page: p, pageSize: 100 })).subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }
}
