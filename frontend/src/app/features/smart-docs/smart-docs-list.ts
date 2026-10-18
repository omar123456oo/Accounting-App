import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { SmartDocsApi } from './smart-docs-api.service';
import { DOC_STATUSES, DocStatus, DocTypeDef, ListParams, Lookups, SmartDoc } from './smart-docs.models';
import { STATUS_TONE } from './smart-docs-ui';

const PAGE_SIZE = 20;

/** Search, filter, sort and page through the documents the person may see. */
@Component({
  selector: 'app-smart-docs-list',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader, StatusBadge, DatePipe],
  template: `
    <app-page-header [title]="'smartDocs.list.title' | translate">
      @if (auth.can('documents.upload')) { <a class="btn btn-primary" routerLink="/app/smart-documents/upload"><i class="fa-solid fa-upload me-1" aria-hidden="true"></i>{{ 'smartDocs.upload.button' | translate }}</a> }
    </app-page-header>

    <form class="row g-2 mb-3" (submit)="$event.preventDefault()" [attr.aria-label]="'smartDocs.list.filters' | translate">
      <div class="col-md-4"><label class="form-label" for="sd-q">{{ 'smartDocs.list.search' | translate }}</label>
        <input id="sd-q" type="search" class="form-control" [ngModel]="params().q" name="q" (ngModelChange)="typed.next($event)" /></div>
      <div class="col-md-2"><label class="form-label" for="sd-status">{{ 'smartDocs.list.status' | translate }}</label>
        <select id="sd-status" class="form-select" [ngModel]="params().status" name="status" (ngModelChange)="set({ status: $event })"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (s of statuses; track s) { <option [value]="s">{{ 'smartDocs.status.' + s | translate }}</option> }</select></div>
      <div class="col-md-2"><label class="form-label" for="sd-type">{{ 'smartDocs.list.type' | translate }}</label>
        <select id="sd-type" class="form-select" [ngModel]="params().typeKey" name="type" (ngModelChange)="set({ typeKey: $event })"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (t of types(); track t.key) { <option [value]="t.key">{{ t.label }}</option> }</select></div>
      <div class="col-md-2"><label class="form-label" for="sd-owner">{{ 'smartDocs.list.owner' | translate }}</label>
        <select id="sd-owner" class="form-select" [ngModel]="params().ownerId" name="owner" (ngModelChange)="set({ ownerId: $event })"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
      <div class="col-md-2"><label class="form-label" for="sd-dep">{{ 'smartDocs.list.department' | translate }}</label>
        <select id="sd-dep" class="form-select" [ngModel]="params().departmentId" name="dep" (ngModelChange)="set({ departmentId: $event })"><option value="">{{ 'smartDocs.list.any' | translate }}</option>@for (d of lookups()?.departments ?? []; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select></div>
      <div class="col-md-2"><label class="form-label" for="sd-from">{{ 'smartDocs.list.expiryFrom' | translate }}</label><input id="sd-from" type="date" dir="ltr" class="form-control" [ngModel]="params().expiryFrom" name="from" (ngModelChange)="set({ expiryFrom: $event })" /></div>
      <div class="col-md-2"><label class="form-label" for="sd-to">{{ 'smartDocs.list.expiryTo' | translate }}</label><input id="sd-to" type="date" dir="ltr" class="form-control" [ngModel]="params().expiryTo" name="to" (ngModelChange)="set({ expiryTo: $event })" /></div>
      <div class="col-md-2"><label class="form-label" for="sd-sort">{{ 'smartDocs.list.sort' | translate }}</label>
        <select id="sd-sort" class="form-select" [ngModel]="params().sort + ':' + params().dir" name="sort" (ngModelChange)="sortBy($event)">
          <option value="createdAt:desc">{{ 'smartDocs.list.sortNewest' | translate }}</option><option value="createdAt:asc">{{ 'smartDocs.list.sortOldest' | translate }}</option>
          <option value="expiryDate:asc">{{ 'smartDocs.list.sortExpiry' | translate }}</option><option value="title:asc">{{ 'smartDocs.list.sortTitle' | translate }}</option></select></div>
    </form>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'smartDocs.loadFailed' | translate }}</div>
    } @else if (rows().length === 0 && !loading()) {
      <p>{{ 'smartDocs.list.empty' | translate }}</p>
    } @else {
      <div class="table-responsive"><table class="table table-hover align-middle">
        <caption class="visually-hidden">{{ 'smartDocs.list.title' | translate }}</caption>
        <thead><tr><th scope="col">{{ 'smartDocs.list.name' | translate }}</th><th scope="col">{{ 'smartDocs.list.type' | translate }}</th><th scope="col">{{ 'smartDocs.list.status' | translate }}</th><th scope="col">{{ 'smartDocs.overview.expiry' | translate }}</th><th scope="col">{{ 'smartDocs.overview.created' | translate }}</th></tr></thead>
        <tbody>
          @for (d of rows(); track d.id) {
            <tr>
              <td><a [routerLink]="['/app/smart-documents', d.id]">{{ d.title }}</a>@if (d.number) { <div class="small text-body-secondary" dir="ltr">{{ d.number }}</div> }</td>
              <td>{{ d.typeLabel ?? d.typeKey }}</td>
              <td><app-status-badge [label]="'smartDocs.status.' + d.status | translate" [tone]="tone(d.status)" /></td>
              <td dir="ltr">{{ d.expiryDate ?? '—' }}</td>
              <td>{{ d.createdAt | date: 'mediumDate' }}</td>
            </tr>
          }
        </tbody>
      </table></div>
      <nav class="d-flex justify-content-between align-items-center" [attr.aria-label]="'smartDocs.list.paging' | translate">
        <span class="text-body-secondary small">{{ 'smartDocs.list.count' | translate: { total: total() } }}</span>
        <div class="btn-group">
          <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="(params().page ?? 1) <= 1" (click)="go((params().page ?? 1) - 1)">{{ 'smartDocs.list.prev' | translate }}</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="(params().page ?? 1) * pageSize >= total()" (click)="go((params().page ?? 1) + 1)">{{ 'smartDocs.list.next' | translate }}</button>
        </div>
      </nav>
    }
  `,
})
export class SmartDocsList {
  private readonly api = inject(SmartDocsApi);
  protected readonly auth = inject(AuthService);
  protected readonly statuses = DOC_STATUSES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly typed = new Subject<string>();
  protected readonly params = signal<ListParams>({ page: 1, pageSize: PAGE_SIZE, q: '', status: '', typeKey: '', ownerId: '', departmentId: '', expiryFrom: '', expiryTo: '', sort: 'createdAt', dir: 'desc' });
  protected readonly rows = signal<SmartDoc[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly types = signal<DocTypeDef[]>([]);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly tone = (s: DocStatus) => STATUS_TONE[s];

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    const status = q.get('status');
    if (status && (DOC_STATUSES as readonly string[]).includes(status)) this.params.update((p) => ({ ...p, status: status as DocStatus }));
    if (q.get('typeKey')) this.params.update((p) => ({ ...p, typeKey: q.get('typeKey') ?? '' }));
    this.api.types().subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    this.api.lookups().subscribe({ next: (l) => this.lookups.set(l), error: () => undefined });
    this.typed.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((q) => this.set({ q }));
    this.load();
  }

  protected set(patch: Partial<ListParams>): void { this.params.update((p) => ({ ...p, ...patch, page: 1 })); this.load(); }
  protected go(page: number): void { this.params.update((p) => ({ ...p, page })); this.load(); }
  protected sortBy(v: string): void { const [sort, dir] = v.split(':'); this.set({ sort, dir: dir as 'asc' | 'desc' }); }

  private load(): void {
    this.loading.set(true); this.loadFailed.set(false);
    this.api.list(this.params()).subscribe({
      next: (r) => { this.rows.set(r.data); this.total.set(r.meta.total); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
  }
}
