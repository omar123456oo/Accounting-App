import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { CoreApiService } from './core-api.service';
import { DocRecordView, DocTypeMeta } from './core.models';
import { visibleFields } from './record-form-model';

const PAGE_SIZE = 20;
const COLUMNS = 4;

/** Records of one admin-made document type: search, page through, open or create. */
@Component({
  selector: 'app-record-list',
  imports: [RouterLink, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="meta()?.label ?? ('core.records.title' | translate)">
      @if (meta()?.canManage) {
        <a class="btn btn-primary" [routerLink]="['/app/records', type, 'new']"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'core.records.new' | translate }}</a>
      }
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.records.notFound' | translate }}</div>
    } @else if (meta(); as m) {
      <div class="mb-3" style="max-inline-size: 24rem">
        <label for="rec-q" class="visually-hidden">{{ 'core.records.search' | translate }}</label>
        <input id="rec-q" type="search" class="form-control" [placeholder]="'core.records.search' | translate" (input)="typed.next($any($event.target).value)" />
      </div>
      @if (rows().length === 0 && !loading()) {
        <p>{{ 'core.records.empty' | translate }}</p>
      } @else {
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <caption class="visually-hidden">{{ m.label }}</caption>
            <thead><tr>
              <th scope="col">{{ 'core.records.name' | translate }}</th>
              @for (c of columns(); track c.fieldname) { <th scope="col">{{ c.label }}</th> }
              @if (hasState()) { <th scope="col">{{ 'core.workflow.status' | translate }}</th> }
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.name) {
                <tr>
                  <td><a [routerLink]="['/app/records', type, r.name]" dir="ltr">{{ r.name }}</a></td>
                  @for (c of columns(); track c.fieldname) { <td>{{ show(r, c.fieldname) }}</td> }
                  @if (hasState()) { <td><span class="badge text-bg-primary">{{ r.stateLabel ?? r.state }}</span></td> }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <nav class="d-flex justify-content-between align-items-center" [attr.aria-label]="'core.records.paging' | translate">
          <span class="text-body-secondary small">{{ 'core.records.count' | translate: { total: total() } }}</span>
          <div class="btn-group">
            <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="page() <= 1" (click)="go(page() - 1)">{{ 'core.records.prev' | translate }}</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="page() * pageSize >= total()" (click)="go(page() + 1)">{{ 'core.records.next' | translate }}</button>
          </div>
        </nav>
      }
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }
  `,
})
export class RecordList {
  private readonly api = inject(CoreApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly pageSize = PAGE_SIZE;
  protected type = '';

  protected readonly meta = signal<DocTypeMeta | null>(null);
  protected readonly rows = signal<DocRecordView[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly typed = new Subject<string>();
  private q = '';
  protected readonly hasState = computed(() => this.rows().some((r) => !!r.state));
  protected readonly columns = computed(() => visibleFields(this.meta()?.fields ?? []).slice(0, COLUMNS));

  constructor() {
    this.route.paramMap
      .pipe(
        map((p) => (this.type = p.get('doctype') ?? '')),
        switchMap((t) => this.api.meta(t)),
        takeUntilDestroyed(),
      )
      .subscribe({ next: (m) => { this.meta.set(m); this.fetch(); }, error: () => this.loadFailed.set(true) });
    this.typed.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed()).subscribe((q) => { this.q = q.trim(); this.page.set(1); this.fetch(); });
  }

  protected go(page: number): void {
    this.page.set(page);
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.api.records(this.type, { q: this.q, page: this.page(), pageSize: PAGE_SIZE }).subscribe({
      next: (r) => { this.rows.set(r.data); this.total.set(r.meta.total); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  protected show(r: DocRecordView, field: string): string {
    const v = r.data[field];
    return v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? '✓' : '') : String(v);
  }
}
