import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { GlobalSearchService, SearchGroup, SearchHit, SearchKind } from './global-search.service';
import { RecentSearches } from './recent-searches';

const ICONS: Record<SearchKind, string> = {
  page: 'compass', client: 'users', document: 'folder-open', task: 'list-check', invoice: 'file-invoice-dollar',
  bill: 'file-invoice', journal: 'pen-to-square', employee: 'id-badge', ticket: 'comments', record: 'table-list',
};

/** The header search box: finds pages, clients, documents, tasks, invoices, bills, journals, employees and tickets in one go. */
@Component({
  selector: 'app-global-search',
  imports: [TranslatePipe],
  styleUrl: './global-search.scss',
  template: `
    <div class="search position-relative">
      <label for="global-search" class="visually-hidden">{{ 'search.label' | translate }}</label>
      <div class="input-group input-group-sm">
        <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
        <input
          #box
          id="global-search"
          type="search"
          class="form-control"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="global-search-list"
          [attr.aria-expanded]="panelOpen()"
          [attr.aria-activedescendant]="activeId()"
          [placeholder]="'search.placeholder' | translate"
          [value]="term()"
          (input)="onInput($any($event.target).value)"
          (focus)="onFocus()"
          (keydown)="onKey($event)"
        />
        <span class="input-group-text d-none d-md-inline text-body-secondary" aria-hidden="true">/</span>
      </div>
      @if (recentOpen()) {
        <div class="results card shadow" id="global-search-recent" role="group" [attr.aria-label]="'search.recent' | translate">
          <div class="d-flex justify-content-between align-items-center px-3 pt-2 pb-1 small text-uppercase text-body-secondary">
            <span>{{ 'search.recent' | translate }}</span>
            <button type="button" class="btn btn-link btn-sm p-0" (mousedown)="$event.preventDefault()" (click)="clearRecent()">{{ 'search.clearRecent' | translate }}</button>
          </div>
          @for (r of recent(); track r) {
            <button type="button" class="result recent d-flex align-items-center gap-2 px-3 py-2 border-0 bg-transparent w-100 text-start" (mousedown)="$event.preventDefault()" (click)="useRecent(r)">
              <i class="fa-solid fa-clock-rotate-left fa-fw text-body-secondary" aria-hidden="true"></i>
              <span class="text-truncate">{{ r }}</span>
            </button>
          }
        </div>
      }
      @if (panelOpen()) {
        <div class="results card shadow" id="global-search-list" role="listbox" [attr.aria-label]="'search.results' | translate">
          @if (loading()) {
            <div class="p-3 text-body-secondary small" role="status">{{ 'common.loading' | translate }}</div>
          } @else if (flat().length === 0) {
            <div class="p-3 text-body-secondary small" role="status">{{ 'search.none' | translate: { term: term() } }}</div>
          } @else {
            @for (g of groups(); track g.kind) {
              <div class="px-3 pt-2 pb-1 small text-uppercase text-body-secondary" role="presentation">{{ 'search.kinds.' + g.kind | translate }}</div>
              @for (h of g.hits; track h.route + h.title) {
                <a
                  class="result d-flex align-items-center gap-2 px-3 py-2 text-decoration-none"
                  role="option"
                  [id]="'gs-' + indexOf(h)"
                  [class.active]="indexOf(h) === active()"
                  [attr.aria-selected]="indexOf(h) === active()"
                  href="javascript:void(0)"
                  (mousedown)="$event.preventDefault()"
                  (click)="go(h)"
                  (mousemove)="active.set(indexOf(h))"
                >
                  <i class="fa-solid fa-{{ icon(h.kind) }} fa-fw text-body-secondary" aria-hidden="true"></i>
                  <span class="text-truncate">{{ h.title }}</span>
                  @if (h.subtitle) {
                    <span class="text-body-secondary small text-truncate ms-auto">{{ h.subtitle }}</span>
                  }
                </a>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class GlobalSearch {
  private readonly service = inject(GlobalSearchService);
  private readonly recents = inject(RecentSearches);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');
  private readonly typed = new Subject<string>();

  protected readonly term = signal('');
  protected readonly open = signal(false);
  protected readonly loading = signal(false);
  protected readonly groups = signal<SearchGroup[]>([]);
  protected readonly active = signal(0);
  protected readonly recent = signal<string[]>([]);
  protected readonly recentOpen = computed(() => this.open() && this.term().trim().length === 0 && this.recent().length > 0);
  protected readonly flat = computed(() => this.groups().flatMap((g) => g.hits));
  protected readonly panelOpen = computed(() => this.open() && this.term().trim().length >= 2);
  protected readonly activeId = computed(() => (this.panelOpen() && this.flat().length ? 'gs-' + this.active() : null));

  constructor() {
    this.typed
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        tap((t) => this.loading.set(t.trim().length >= 2)),
        switchMap((t) => (t.trim().length >= 2 ? this.service.search(t) : of<SearchGroup[]>([]))),
        takeUntilDestroyed(),
      )
      .subscribe((groups) => {
        this.groups.set(groups);
        this.active.set(0);
        this.loading.set(false);
      });
  }

  protected icon(kind: SearchKind): string {
    return ICONS[kind];
  }

  protected indexOf(hit: SearchHit): number {
    return this.flat().indexOf(hit);
  }

  protected onFocus(): void {
    this.service.prepare();
    this.recent.set(this.recents.list());
    this.open.set(true);
  }

  protected onInput(value: string): void {
    this.term.set(value);
    this.open.set(true);
    if (value.trim().length >= 2) this.loading.set(true);
    this.typed.next(value);
  }

  protected onKey(e: KeyboardEvent): void {
    const n = this.flat().length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); this.active.set((this.active() + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); this.active.set((this.active() - 1 + n) % n); }
    else if (e.key === 'Enter' && this.panelOpen() && n && !this.loading()) { e.preventDefault(); this.go(this.flat()[this.active()]); }
    else if (e.key === 'Escape') { this.open.set(false); this.box().nativeElement.blur(); }
  }

  protected useRecent(term: string): void {
    this.onInput(term);
    this.box().nativeElement.focus();
  }

  protected clearRecent(): void {
    this.recents.clear();
    this.recent.set([]);
  }

  protected go(hit: SearchHit): void {
    this.recents.add(this.term());
    this.open.set(false);
    this.term.set('');
    this.groups.set([]);
    this.box().nativeElement.blur();
    void this.router.navigate([hit.route], hit.query ? { queryParams: hit.query } : {});
  }

  /** "/" or Ctrl/Cmd+K focuses the box from anywhere that is not a text field. */
  @HostListener('document:keydown', ['$event'])
  protected shortcut(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const typing = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      this.box().nativeElement.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  protected outside(e: Event): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
