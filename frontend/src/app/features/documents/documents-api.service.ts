import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { DocumentListParams, DocumentRecord, DocumentRequest, DocumentUploadInput, RequestStatus } from './documents.models';

const BASE = '/api/v1/staff';

function toParams(params: object): HttpParams {
  let query = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query = query.set(key, String(value));
  }
  return query;
}

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  private readonly http = inject(HttpClient);

  list(params: DocumentListParams = {}): Observable<Page<DocumentRecord>> {
    return this.http.get<Page<DocumentRecord>>(`${BASE}/documents`, { params: toParams(params) });
  }

  /** Same listing narrowed to one client; answers 404 when the client is not visible to the user. */
  listForClient(clientId: string, params: DocumentListParams = {}): Observable<Page<DocumentRecord>> {
    return this.http.get<Page<DocumentRecord>>(`${BASE}/clients/${clientId}/documents`, { params: toParams(params) });
  }

  get(id: string): Observable<DocumentRecord> {
    return this.http.get<{ data: DocumentRecord }>(`${BASE}/documents/${id}`).pipe(map((r) => r.data));
  }

  upload(clientId: string, input: DocumentUploadInput): Observable<DocumentRecord> {
    const form = new FormData();
    form.append('file', input.file, input.file.name);
    form.append('name', input.name);
    form.append('category', input.category);
    form.append('year', String(input.year));
    for (const [key, value] of [['periodLabel', input.periodLabel], ['description', input.description], ['expiryDate', input.expiryDate], ['requestId', input.requestId]]) {
      if (value) form.append(key as string, value);
    }
    for (const tag of input.tags ?? []) form.append('tags[]', tag);
    return this.http.post<{ data: DocumentRecord }>(`${BASE}/clients/${clientId}/documents`, form, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  uploadVersion(id: string, file: File): Observable<DocumentRecord> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{ data: DocumentRecord }>(`${BASE}/documents/${id}/versions`, form, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  /** Authenticated download: the bytes come back as a Blob. There is no public or shareable URL. */
  download(id: string, version?: number): Observable<Blob> {
    return this.http.get(`${BASE}/documents/${id}/download`, { params: toParams({ version }), responseType: 'blob' });
  }

  review(id: string, decision: 'approved' | 'rejected', comment?: string): Observable<DocumentRecord> {
    return this.http.post<{ data: DocumentRecord }>(`${BASE}/documents/${id}/review`, { decision, comment: comment ?? '' }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  listRequests(clientId: string): Observable<DocumentRequest[]> {
    return this.http.get<{ data: DocumentRequest[] }>(`${BASE}/clients/${clientId}/document-requests`).pipe(map((r) => r.data));
  }

  createRequest(clientId: string, input: { label: string; dueDate: string }): Observable<DocumentRequest> {
    return this.http.post<{ data: DocumentRequest }>(`${BASE}/clients/${clientId}/document-requests`, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  updateRequest(id: string, status: Exclude<RequestStatus, 'open'>): Observable<DocumentRequest> {
    return this.http.patch<{ data: DocumentRequest }>(`${BASE}/document-requests/${id}`, { status }).pipe(map((r) => r.data));
  }
}
