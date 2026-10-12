import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Column, DataTable, SortChange } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { BadgeTone, StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { CLIENT_STATUSES, Client, ClientListParams, LEGAL_FORMS, LegalForm, ClientStatus, Page } from '../client.models';
import { ClientFormat, STATUS_TONE } from '../client-format';
import { ClientsApiService } from '../clients-api.service';
import { downloadCsv, toCsv } from '../csv';

@Component({
  selector: 'app-client-list',
  imports: [RouterLink, TranslatePipe, DataTable, PageHeader, StatusBadge, HasPermissionDirective],
  templateUrl: './client-list.html',
})
export class ClientList {
  private readonly api = inject(ClientsApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(ClientFormat);

  protected readonly statuses = CLIENT_STATUSES;
  protected readonly legalForms = LEGAL_FORMS;
  protected readonly columns: readonly Column[] = [
    { key: 'legalName', labelKey: 'clients.fields.legalName', sortable: true },
    { key: 'legalForm', labelKey: 'clients.fields.legalForm', sortable: true },
    { key: 'status', labelKey: 'clients.fields.status', sortable: true },
    { key: 'createdAt', labelKey: 'clients.fields.createdAt', sortable: true },
  ];

  protected readonly params = signal<ClientListParams>({ page: 1, pageSize: 10, sort: 'legalName', dir: 'asc', includeArchived: false });
  protected readonly result = signal<Page<Client> | null>(null);
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
          this.api.list(this.params()).pipe(
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
  }

  protected toneOf(status: ClientStatus): BadgeTone {
    return STATUS_TONE[status];
  }

  protected reload(): void {
    this.load$.next();
  }

  protected patch(change: Partial<ClientListParams>, resetPage = true): void {
    this.params.update((p) => ({ ...p, ...change, ...(resetPage ? { page: 1 } : {}) }));
    this.reload();
  }

  protected search(event: Event, q: string): void {
    event.preventDefault();
    this.patch({ q: q.trim() });
  }

  protected onSort(change: SortChange): void {
    this.patch({ sort: change.sort, dir: change.dir });
  }

  protected setStatus(value: string): void {
    this.patch({ status: value as ClientStatus | '' });
  }

  protected setLegalForm(value: string): void {
    this.patch({ legalForm: value as LegalForm | '' });
  }

  protected exportCsv(): void {
    const rows = this.result()?.data ?? [];
    const t = (key: string) => this.translate.instant(key) as string;
    const header = ['id', 'legalName', 'tradeName', 'legalForm', 'status', 'commercialRegistrationNo', 'taxRegistrationNo', 'createdAt'].map((f) => t(`clients.fields.${f}`));
    const body = rows.map((c) => [c.id, c.legalName, c.tradeName, t(`clients.legalForm.${c.legalForm}`), t(`clients.status.${c.status}`), c.commercialRegistrationNo, c.taxRegistrationNo, c.createdAt]);
    downloadCsv('clients.csv', toCsv(header, body));
  }
}
