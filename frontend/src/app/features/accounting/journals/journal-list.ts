import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Column, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Page } from '../../clients/client.models';
import { Account, JOURNAL_STATUSES, JournalEntry, JournalListParams } from '../accounting.models';
import { AccountingFormat, JOURNAL_TONE } from '../accounting-format';
import { JournalsApiService } from '../journals-api.service';
import { LedgerApiService } from '../ledger-api.service';
import { LedgerContext } from '../ledger-context';
import { RecurringTemplates } from './recurring-templates';

/** Journal entries of the active ledger with status, date, account and text filters. */
@Component({
  selector: 'app-journal-list',
  imports: [RouterLink, TranslatePipe, DataTable, PageHeader, StatusBadge, HasPermissionDirective, RecurringTemplates],
  templateUrl: './journal-list.html',
})
export class JournalList {
  private readonly api = inject(JournalsApiService);
  protected readonly format = inject(AccountingFormat);
  protected readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly auth = inject(AuthService);

  protected readonly statuses = JOURNAL_STATUSES;
  protected readonly tone = JOURNAL_TONE;
  protected readonly columns: readonly Column[] = [
    { key: 'reference', labelKey: 'accounting.journals.fields.reference' },
    { key: 'postingDate', labelKey: 'accounting.journals.fields.postingDate' },
    { key: 'description', labelKey: 'accounting.journals.fields.description' },
    { key: 'entryType', labelKey: 'accounting.journals.fields.type' },
    { key: 'totalDebit', labelKey: 'accounting.journals.fields.total' },
    { key: 'createdByName', labelKey: 'accounting.journals.fields.createdBy' },
    { key: 'status', labelKey: 'accounting.journals.fields.status' },
  ];

  protected readonly params = signal<JournalListParams>({ page: 1, pageSize: 10, status: inject(ActivatedRoute).snapshot.queryParamMap.get('status') ?? '' });
  protected readonly result = signal<Page<JournalEntry> | null>(null);
  protected readonly accounts = signal<Account[]>([]);
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
          this.api.list(this.ledgerId, this.params()).pipe(
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
    if (this.auth.can('ledger.view')) inject(LedgerApiService).accounts(this.ledgerId).subscribe({ next: (a) => this.accounts.set(a), error: () => this.accounts.set([]) });
  }

  protected reload(): void {
    this.load$.next();
  }

  protected patch(change: Partial<JournalListParams>, resetPage = true): void {
    this.params.update((p) => ({ ...p, ...change, ...(resetPage ? { page: 1 } : {}) }));
    this.reload();
  }

  protected search(event: Event, q: string): void {
    event.preventDefault();
    this.patch({ q: q.trim() });
  }
}
