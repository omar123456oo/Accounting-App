import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, catchError, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { CommentDialog } from '../../../shared/components/comment-dialog/comment-dialog';
import { Column, DataTable, SortChange } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { Page } from '../../clients/client.models';
import { ClientFormat } from '../../clients/client-format';
import { ClientsApiService } from '../../clients/clients-api.service';
import { DocumentDetail } from '../document-detail';
import { EXPIRY_TONE, REVIEW_TONE, saveBlob } from '../document-format';
import { DocumentRequests } from '../document-requests';
import { DocumentsApiService } from '../documents-api.service';
import { AssignableClient, DOCUMENT_CATEGORIES, DocumentListParams, DocumentRecord, DocumentRequest, REVIEW_STATUSES } from '../documents.models';
import { UploadDialog } from '../upload/upload-dialog';

type Dialog =
  | { kind: 'upload'; requestId?: string }
  | { kind: 'version'; doc: DocumentRecord }
  | { kind: 'detail'; doc: DocumentRecord }
  | { kind: 'approve' | 'reject'; doc: DocumentRecord };

/**
 * Document repository. Used as the global /app/documents page, or embedded in a client's Documents tab when
 * `clientId` is given (then it is narrowed to that client and also shows the missing-document requests).
 */
@Component({
  selector: 'app-document-list',
  imports: [TranslatePipe, DataTable, PageHeader, StatusBadge, HasPermissionDirective, CommentDialog, UploadDialog, DocumentDetail, DocumentRequests],
  templateUrl: './document-list.html',
})
export class DocumentList {
  private readonly api = inject(DocumentsApiService);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(ClientFormat);

  readonly clientId = input<string>();

  protected readonly categories = DOCUMENT_CATEGORIES;
  protected readonly reviewStatuses = REVIEW_STATUSES;
  protected readonly reviewTone = REVIEW_TONE;
  protected readonly expiryTone = EXPIRY_TONE;
  protected readonly embedded = computed(() => !!this.clientId());
  protected readonly columns = computed<readonly Column[]>(() => [
    { key: 'name', labelKey: 'documents.fields.name', sortable: true },
    ...(this.embedded() ? [] : [{ key: 'clientName', labelKey: 'documents.client', sortable: true }]),
    { key: 'category', labelKey: 'documents.fields.category', sortable: true },
    { key: 'year', labelKey: 'documents.fields.year', sortable: true },
    { key: 'version', labelKey: 'documents.version' },
    { key: 'reviewStatus', labelKey: 'documents.fields.reviewStatus', sortable: true },
    { key: 'expiryDate', labelKey: 'documents.fields.expiryDate', sortable: true },
    { key: 'actions', labelKey: 'common.actions' },
  ]);

  protected readonly params = signal<DocumentListParams>({ page: 1, pageSize: 10, sort: 'uploadedAt', dir: 'desc' });
  protected readonly result = signal<Page<DocumentRecord> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly clients = signal<AssignableClient[]>([]);
  protected readonly requests = signal<DocumentRequest[]>([]);
  protected readonly requestsVersion = signal(0);
  protected readonly dialog = signal<Dialog | null>(null);
  protected readonly actionError = signal<string | null>(null);
  private readonly load$ = new Subject<void>();

  constructor() {
    this.load$
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap(() => {
          const id = this.clientId();
          const request = id ? this.api.listForClient(id, this.params()) : this.api.list(this.params());
          return request.pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((page) => {
        this.result.set(page);
        this.loading.set(false);
      });
    // Filters and the upload form need the client names, which only users who may view clients can get.
    if (this.auth.can('clients.view')) {
      this.clientsApi.list({ pageSize: 100, sort: 'legalName' }).subscribe({ next: (p) => this.clients.set(p.data.map((c) => ({ id: c.id, name: c.legalName }))), error: () => this.clients.set([]) });
    }
    queueMicrotask(() => this.load$.next());
  }

  protected patch(change: Partial<DocumentListParams>, resetPage = true): void {
    this.params.update((p) => ({ ...p, ...change, ...(resetPage ? { page: 1 } : {}) }));
    this.load$.next();
  }

  protected search(event: Event, q: string): void {
    event.preventDefault();
    this.patch({ q: q.trim() });
  }

  protected onSort(change: SortChange): void {
    this.patch({ sort: change.sort, dir: change.dir });
  }

  protected setYear(value: string): void {
    this.patch({ year: value ? Number(value) : '' });
  }

  protected reload(): void {
    this.load$.next();
  }

  protected download(doc: DocumentRecord, version?: number): void {
    this.actionError.set(null);
    const file = doc.versions.find((v) => v.version === (version ?? doc.currentVersion));
    this.api.download(doc.id, version).subscribe({
      next: (blob) => saveBlob(blob, file?.fileName ?? doc.name),
      error: (e: unknown) => this.actionError.set(apiErrorMessage(e)),
    });
  }

  protected uploaded(): void {
    this.dialog.set(null);
    this.requestsVersion.update((n) => n + 1);
    this.reload();
  }

  protected decide(decision: 'approved' | 'rejected', comment: string): void {
    const d = this.dialog();
    this.dialog.set(null);
    if (!d || !('doc' in d)) return;
    this.actionError.set(null);
    this.api.review(d.doc.id, decision, comment).subscribe({
      next: () => this.reload(),
      error: (e: unknown) => {
        this.actionError.set(apiErrorMessage(e));
        this.reload();
      },
    });
  }

  protected asDoc(): DocumentRecord | null {
    const d = this.dialog();
    return d && 'doc' in d ? d.doc : null;
  }
}
