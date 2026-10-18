import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { SmartDocsApi } from './smart-docs-api.service';
import { Dashboard, DashboardParams, DocTypeDef, DOC_STATUSES, Lookups, SmartConfig } from './smart-docs.models';

/** The office's documents at a glance: real counts from the server, what needs a person, and what expires next. */
@Component({
  selector: 'app-smart-docs-dashboard',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader, DatePipe],
  template: `
    <app-page-header [title]="'smartDocs.dashboard.title' | translate">
      @if (auth.can('documents.upload')) { <a class="btn btn-primary" routerLink="/app/smart-documents/upload"><i class="fa-solid fa-upload me-1" aria-hidden="true"></i>{{ 'smartDocs.upload.button' | translate }}</a> }
      <a class="btn btn-outline-secondary" routerLink="/app/smart-documents/list">{{ 'smartDocs.nav.list' | translate }}</a>
    </app-page-header>

    @if (config(); as c) {
      @if (!c.ai.configured || !c.ocr.configured || !c.mail.configured) {
        <div class="alert alert-info" role="status">
          <strong>{{ 'smartDocs.config.title' | translate }}</strong>
          <ul class="mb-0 ps-3">
            @if (!c.ai.configured) { <li>{{ 'smartDocs.config.noAi' | translate }}</li> }
            @if (!c.ocr.configured) { <li>{{ 'smartDocs.config.noOcr' | translate }}</li> }
            @if (!c.mail.configured) { <li>{{ 'smartDocs.config.noMail' | translate }}</li> }
          </ul>
        </div>
      }
    }

    <form class="row g-2 mb-4" (submit)="$event.preventDefault()" [attr.aria-label]="'smartDocs.list.filters' | translate">
      <div class="col-6 col-md-2"><label class="form-label" for="db-from">{{ 'smartDocs.dashboard.from' | translate }}</label><input id="db-from" type="date" dir="ltr" class="form-control" name="from" [(ngModel)]="filters.from" (ngModelChange)="load()" /></div>
      <div class="col-6 col-md-2"><label class="form-label" for="db-to">{{ 'smartDocs.dashboard.to' | translate }}</label><input id="db-to" type="date" dir="ltr" class="form-control" name="to" [(ngModel)]="filters.to" (ngModelChange)="load()" /></div>
      <div class="col-6 col-md-2"><label class="form-label" for="db-type">{{ 'smartDocs.list.type' | translate }}</label>
        <select id="db-type" class="form-select" name="type" [(ngModel)]="filters.typeKey" (ngModelChange)="load()"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (t of types(); track t.key) { <option [value]="t.key">{{ t.label }}</option> }</select></div>
      <div class="col-6 col-md-2"><label class="form-label" for="db-status">{{ 'smartDocs.list.status' | translate }}</label>
        <select id="db-status" class="form-select" name="status" [(ngModel)]="filters.status" (ngModelChange)="load()"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (s of statuses; track s) { <option [value]="s">{{ 'smartDocs.status.' + s | translate }}</option> }</select></div>
      <div class="col-6 col-md-2"><label class="form-label" for="db-owner">{{ 'smartDocs.list.owner' | translate }}</label>
        <select id="db-owner" class="form-select" name="owner" [(ngModel)]="filters.ownerId" (ngModelChange)="load()"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
      <div class="col-6 col-md-2"><label class="form-label" for="db-dep">{{ 'smartDocs.list.department' | translate }}</label>
        <select id="db-dep" class="form-select" name="dep" [(ngModel)]="filters.departmentId" (ngModelChange)="load()"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (d of lookups()?.departments ?? []; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select></div>
      <div class="col-6 col-md-2"><label class="form-label" for="db-rev">{{ 'smartDocs.dashboard.reviewer' | translate }}</label>
        <select id="db-rev" class="form-select" name="rev" [(ngModel)]="filters.reviewerId" (ngModelChange)="load()"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
    </form>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'smartDocs.loadFailed' | translate }}</div>
    } @else if (data(); as d) {
      <div class="row g-3 mb-4">
        @for (c of cards(d); track c.key) {
          <div class="col-6 col-lg-3">
            <a class="card h-100 text-decoration-none" [routerLink]="c.link" [queryParams]="c.query" [attr.data-card]="c.key">
              <div class="card-body"><div class="display-6">{{ c.value }}</div><div class="text-body-secondary">{{ 'smartDocs.dashboard.' + c.key | translate }}</div></div>
            </a>
          </div>
        }
      </div>
      <div class="row g-4">
        <div class="col-lg-6">
          <h2 class="h5">{{ 'smartDocs.dashboard.upcomingExpiries' | translate }}</h2>
          <ul class="list-group">
            @for (e of d.upcomingExpiries; track e.id) {
              <li class="list-group-item d-flex justify-content-between"><a [routerLink]="['/app/smart-documents', e.id]">{{ e.title }}</a><span dir="ltr" class="text-body-secondary">{{ e.expiryDate }} · {{ 'smartDocs.dashboard.daysLeft' | translate: { n: e.daysLeft } }}</span></li>
            } @empty { <li class="list-group-item text-body-secondary">{{ 'smartDocs.dashboard.noExpiries' | translate }}</li> }
          </ul>
        </div>
        <div class="col-lg-6">
          <h2 class="h5">{{ 'smartDocs.dashboard.recent' | translate }}</h2>
          <ul class="list-group">
            @for (a of d.recentActivity; track $index) {
              <li class="list-group-item"><a [routerLink]="['/app/smart-documents', a.documentId]">{{ a.title }}</a> · {{ 'smartDocs.history.action.' + a.action | translate }}
                <div class="small text-body-secondary">{{ a.actor ?? ('smartDocs.history.system' | translate) }} · {{ a.at | date: 'medium' }}</div></li>
            } @empty { <li class="list-group-item text-body-secondary">{{ 'smartDocs.dashboard.noActivity' | translate }}</li> }
          </ul>
        </div>
      </div>
    } @else { <p role="status">{{ 'common.loading' | translate }}</p> }
  `,
})
export class SmartDocsDashboard {
  private readonly api = inject(SmartDocsApi);
  protected readonly auth = inject(AuthService);
  protected readonly statuses = DOC_STATUSES;
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly types = signal<DocTypeDef[]>([]);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly config = signal<SmartConfig | null>(null);
  protected readonly loadFailed = signal(false);
  protected filters: Required<Pick<DashboardParams, 'from' | 'to' | 'typeKey' | 'status' | 'ownerId' | 'departmentId' | 'reviewerId'>> = { from: '', to: '', typeKey: '', status: '', ownerId: '', departmentId: '', reviewerId: '' };

  constructor() {
    this.api.types().subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    this.api.lookups().subscribe({ next: (l) => this.lookups.set(l), error: () => undefined });
    this.api.config().subscribe({ next: (c) => this.config.set(c), error: () => undefined });
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.api.dashboard(this.filters).subscribe({ next: (d) => this.data.set(d), error: () => this.loadFailed.set(true) });
  }

  protected cards(d: Dashboard): Array<{ key: string; value: number; link: string; query: Record<string, string> }> {
    const t = d.totals; const list = '/app/smart-documents/list';
    return [
      { key: 'total', value: t.total, link: list, query: {} },
      { key: 'awaitingReview', value: t.awaitingReview, link: list, query: { status: 'pending_review' } },
      { key: 'processing', value: t.processing, link: list, query: { status: 'processing' } },
      { key: 'expiringSoon', value: t.expiringSoon, link: list, query: { status: 'expiring_soon' } },
      { key: 'expired', value: t.expired, link: list, query: { status: 'expired' } },
      { key: 'failedExtraction', value: t.failedExtraction, link: list, query: { status: 'extraction_failed' } },
      { key: 'upcomingReminders', value: t.upcomingReminders, link: '/app/smart-documents/reminders', query: {} },
      { key: 'failedReminders', value: t.failedReminders, link: '/app/smart-documents/reminders', query: { tab: 'failed' } },
    ];
  }
}
