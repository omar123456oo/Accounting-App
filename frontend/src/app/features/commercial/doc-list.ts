import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subject, catchError, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Column, DataTable } from '../../shared/components/data-table/data-table';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { LedgerContext } from '../accounting/ledger-context';
import { Page } from '../clients/client.models';
import { InvoicingApiService } from '../invoicing/invoicing-api.service';
import { PayablesApiService } from '../payables/payables-api.service';
import { CommercialApiService } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { BILL_STATUSES, DocBase, DocListParams, INVOICE_STATUSES, Party, Side } from './commercial.models';

/** Invoices (receivables) or supplier bills (payables) of the active ledger, with status, party and text filters. */
@Component({
  selector: 'app-doc-list',
  imports: [RouterLink, TranslatePipe, DataTable, PageHeader, StatusBadge],
  template: `
    <app-page-header [title]="'commercial.docs.' + side + '.title' | translate">
      @if (canCreate) {
        <a class="btn btn-primary" [routerLink]="[base, 'new']">{{ 'commercial.docs.' + side + '.new' | translate }}</a>
      }
    </app-page-header>
    <form class="row g-2 align-items-end mb-3" role="search" (submit)="search($event, q.value)">
      <div class="col-12 col-md-4">
        <label for="doc-q" class="form-label">{{ 'commercial.docs.search' | translate }}</label>
        <input #q id="doc-q" type="search" class="form-control" [value]="params().q ?? ''" />
      </div>
      <div class="col-6 col-md-3">
        <label for="doc-status" class="form-label">{{ 'commercial.docs.status' | translate }}</label>
        <select id="doc-status" class="form-select" (change)="patch({ status: $any($event.target).value })">
          <option value="" [selected]="!params().status">{{ 'clients.all' | translate }}</option>
          @for (s of statuses; track s) {
            <option [value]="s" [selected]="params().status === s">{{ 'commercial.status.' + s | translate }}</option>
          }
        </select>
      </div>
      <div class="col-6 col-md-3">
        <label for="doc-party" class="form-label">{{ 'commercial.parties.' + side + '.one' | translate }}</label>
        <select id="doc-party" class="form-select" (change)="patch({ partyId: $any($event.target).value })">
          <option value="">{{ 'clients.all' | translate }}</option>
          @for (p of parties(); track p.id) {
            <option [value]="p.id" [selected]="params().partyId === p.id">{{ p.name }}</option>
          }
        </select>
      </div>
      <div class="col-auto"><button type="submit" class="btn btn-secondary">{{ 'clients.searchButton' | translate }}</button></div>
    </form>
    <div [attr.aria-busy]="loading()">
      @if (failed()) {
        <div class="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
          <span>{{ 'clients.loadFailed' | translate }}</span>
          <button type="button" class="btn btn-outline-danger btn-sm" (click)="reload()">{{ 'common.retry' | translate }}</button>
        </div>
      } @else if (loading() && !result()) {
        <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
      } @else if (result(); as page) {
        @if (page.data.length === 0) {
          <div class="alert alert-secondary" role="status">{{ 'commercial.docs.empty' | translate }}</div>
        } @else {
          <app-data-table [columns]="columns" [rows]="page.data" [caption]="'commercial.docs.' + side + '.title' | translate" [page]="page.meta.page" [pageSize]="page.meta.pageSize" [total]="page.meta.total" (pageChange)="patch({ page: $event }, false)">
            <ng-template let-row>
              <td dir="ltr" class="text-start"><a [routerLink]="[base, row.id]">{{ row.reference }}</a></td>
              <td>{{ row.partyName }}</td>
              <td>{{ format.date(row.date) }}</td>
              <td>{{ format.date(row.dueDate) }}</td>
              <td dir="ltr" class="text-end">{{ format.amount(row.total) }}</td>
              <td dir="ltr" class="text-end">{{ format.amount(row.balance) }}</td>
              <td><app-status-badge [label]="'commercial.status.' + row.status | translate" [tone]="format.tone[row.status]" /></td>
            </ng-template>
          </app-data-table>
        }
      }
    </div>
  `,
})
export class DocList {
  private readonly invoices = inject(InvoicingApiService);
  private readonly bills = inject(PayablesApiService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly side = inject(ActivatedRoute).snapshot.data['side'] as Side;
  protected readonly base = this.side === 'ar' ? '/app/invoicing/invoices' : '/app/payables/bills';
  protected readonly canCreate = inject(AuthService).can(this.side === 'ar' ? 'invoices.create' : 'bills.create');
  protected readonly statuses = this.side === 'ar' ? INVOICE_STATUSES : BILL_STATUSES;
  protected readonly columns: readonly Column[] = [
    { key: 'reference', labelKey: 'commercial.docs.col.reference' },
    { key: 'party', labelKey: `commercial.docs.col.${this.side}Party` },
    { key: 'date', labelKey: 'commercial.docs.col.date' },
    { key: 'dueDate', labelKey: 'commercial.docs.col.dueDate' },
    { key: 'total', labelKey: 'commercial.docs.col.total' },
    { key: 'balance', labelKey: 'commercial.docs.col.balance' },
    { key: 'status', labelKey: 'commercial.docs.col.status' },
  ];
  protected readonly params = signal<DocListParams>({ page: 1, pageSize: 10, status: inject(ActivatedRoute).snapshot.queryParamMap.get('status') ?? '', partyId: inject(ActivatedRoute).snapshot.queryParamMap.get('partyId') ?? '' });
  protected readonly result = signal<Page<DocBase> | null>(null);
  protected readonly parties = signal<Party[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private readonly load$ = new Subject<void>();

  constructor() {
    this.load$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(() =>
          this.request().pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((page) => {
        this.result.set(page);
        this.loading.set(false);
      });
    this.load$.next();
    inject(CommercialApiService).parties(this.ledgerId, this.side).subscribe({ next: (p) => this.parties.set(p), error: () => this.parties.set([]) });
  }

  private request(): Observable<Page<DocBase>> {
    return (this.side === 'ar' ? this.invoices.list(this.ledgerId, this.params()) : this.bills.list(this.ledgerId, this.params())) as Observable<Page<DocBase>>;
  }

  protected reload(): void {
    this.load$.next();
  }

  protected patch(change: Partial<DocListParams>, resetPage = true): void {
    this.params.update((p) => ({ ...p, ...change, ...(resetPage ? { page: 1 } : {}) }));
    this.reload();
  }

  protected search(event: Event, q: string): void {
    event.preventDefault();
    this.patch({ q: q.trim() });
  }
}
