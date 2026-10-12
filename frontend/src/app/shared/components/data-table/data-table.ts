import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, contentChild, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface Column {
  key: string;
  labelKey: string;
  sortable?: boolean;
}
export type SortDir = 'asc' | 'desc';
export interface SortChange {
  sort: string;
  dir: SortDir;
}

/** Sortable, paginated table. Rows are rendered by the `<ng-template let-row>` the consumer projects. */
@Component({
  selector: 'app-data-table',
  imports: [NgTemplateOutlet, TranslatePipe],
  template: `
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <caption class="visually-hidden">{{ caption() }}</caption>
        <thead>
          <tr>
            @for (col of columns(); track col.key) {
              <th scope="col" [attr.aria-sort]="ariaSort(col)">
                @if (col.sortable) {
                  <button type="button" class="btn btn-link p-0 text-decoration-none fw-bold" (click)="toggle(col)">
                    {{ col.labelKey | translate }}
                    <span aria-hidden="true">{{ sort() === col.key ? (dir() === 'asc' ? '▲' : '▼') : '' }}</span>
                  </button>
                } @else {
                  {{ col.labelKey | translate }}
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track $index) {
            <tr><ng-container [ngTemplateOutlet]="rowTemplate()" [ngTemplateOutletContext]="{ $implicit: row }" /></tr>
          }
        </tbody>
      </table>
    </div>
    <nav class="d-flex align-items-center justify-content-between" [attr.aria-label]="'table.pagination' | translate">
      <span class="text-body-secondary" aria-live="polite">{{ 'table.pageOf' | translate: { page: page(), pages: pages(), total: total() } }}</span>
      <div class="btn-group">
        <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">{{ 'table.previous' | translate }}</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="page() >= pages()" (click)="pageChange.emit(page() + 1)">{{ 'table.next' | translate }}</button>
      </div>
    </nav>
  `,
})
export class DataTable {
  readonly columns = input.required<readonly Column[]>();
  readonly rows = input.required<readonly unknown[]>();
  readonly caption = input.required<string>();
  readonly sort = input('');
  readonly dir = input<SortDir>('asc');
  readonly page = input(1);
  readonly pageSize = input(10);
  readonly total = input(0);
  readonly sortChange = output<SortChange>();
  readonly pageChange = output<number>();

  protected readonly rowTemplate = contentChild.required(TemplateRef);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  protected ariaSort(col: Column): string | null {
    if (!col.sortable) return null;
    return this.sort() === col.key ? (this.dir() === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected toggle(col: Column): void {
    const sameColumn = this.sort() === col.key;
    this.sortChange.emit({ sort: col.key, dir: sameColumn && this.dir() === 'asc' ? 'desc' : 'asc' });
  }
}
