import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import {
  Dashboard, DashboardParams, Delivery, DocPatch, DocTypeDef, DocField, Extraction, FieldValue, History, ListParams, Lookups, Page, ReminderJob, ReminderRule, ReminderRuleInput,
  ReviewDecision, SmartConfig, SmartDoc, UploadDone, UploadInput, UploadProgress, VersionRow,
} from './smart-docs.models';

const BASE = '/api/v1/staff/docs';
const enc = encodeURIComponent;

function toParams(params: object): HttpParams {
  let query = new HttpParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') query = query.set(key, String(value));
  return query;
}

/** Smart documents: upload, extraction, review, lifecycle, reminders. Needs the real API: the mock API does not serve /docs. */
@Injectable({ providedIn: 'root' })
export class SmartDocsApi {
  private readonly http = inject(HttpClient);
  private data<T>(o: Observable<{ data: T }>): Observable<T> { return o.pipe(map((r) => r.data)); }

  config(): Observable<SmartConfig> { return this.data(this.http.get<{ data: SmartConfig }>(`${BASE}/config`)); }
  lookups(): Observable<Lookups> { return this.data(this.http.get<{ data: Lookups }>(`${BASE}/lookups`)); }
  dashboard(p: DashboardParams = {}): Observable<Dashboard> { return this.data(this.http.get<{ data: Dashboard }>(`${BASE}/dashboard`, { params: toParams(p) })); }

  // documents
  list(p: ListParams = {}): Observable<Page<SmartDoc>> { return this.http.get<Page<SmartDoc>>(`${BASE}/documents`, { params: toParams(p) }); }
  get(id: string): Observable<SmartDoc> { return this.data(this.http.get<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}`)); }
  update(id: string, patch: DocPatch): Observable<SmartDoc> { return this.data(this.http.patch<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}`, patch)); }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/documents/${enc(id)}`); }

  /** Emits progress events and finally the stored document. The file goes up as multipart; the server re-checks everything. */
  upload(input: UploadInput): Observable<UploadProgress | UploadDone> {
    const form = new FormData();
    form.append('file', input.file, input.file.name);
    for (const [k, v] of Object.entries({ title: input.title, typeKey: input.typeKey, ownerId: input.ownerId, employeeId: input.employeeId, departmentId: input.departmentId, reviewerId: input.reviewerId, visibility: input.visibility })) if (v) form.append(k, v);
    if (input.allowDuplicate) form.append('allowDuplicate', 'true');
    return this.progress(this.http.post<{ data: SmartDoc }>(`${BASE}/documents`, form, { observe: 'events', reportProgress: true }));
  }

  uploadVersion(id: string, file: File, reason?: string): Observable<UploadProgress | UploadDone> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (reason) form.append('reason', reason);
    return this.progress(this.http.post<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}/versions`, form, { observe: 'events', reportProgress: true }));
  }

  private progress(events: Observable<HttpEvent<{ data: SmartDoc }>>): Observable<UploadProgress | UploadDone> {
    return events.pipe(
      filter((e) => e.type === HttpEventType.UploadProgress || e.type === HttpEventType.Response),
      map((e): UploadProgress | UploadDone => e.type === HttpEventType.Response
        ? { kind: 'done', doc: (e.body as { data: SmartDoc }).data }
        : { kind: 'progress', percent: e.type === HttpEventType.UploadProgress && e.total ? Math.round((100 * e.loaded) / e.total) : 0 }),
    );
  }

  versions(id: string): Observable<VersionRow[]> { return this.data(this.http.get<{ data: VersionRow[] }>(`${BASE}/documents/${enc(id)}/versions`)); }
  history(id: string): Observable<History> { return this.data(this.http.get<{ data: History }>(`${BASE}/documents/${enc(id)}/history`)); }

  /** The PDF as bytes. `inline` is for the preview (documents.view); a download needs documents.download. */
  file(id: string, opts: { version?: number; inline?: boolean } = {}): Observable<Blob> {
    return this.http.get(`${BASE}/documents/${enc(id)}/file`, { params: toParams({ version: opts.version, inline: opts.inline ? 1 : undefined }), responseType: 'blob' });
  }

  // extraction and review
  extraction(id: string): Observable<Extraction | null> { return this.data(this.http.get<{ data: Extraction | null }>(`${BASE}/documents/${enc(id)}/extraction`)); }
  pageText(id: string, page: number): Observable<{ page: number; method: string; text: string }> { return this.data(this.http.get<{ data: { page: number; method: string; text: string } }>(`${BASE}/documents/${enc(id)}/extraction/pages/${page}`)); }
  extract(id: string, typeKey?: string): Observable<void> { return this.http.post<unknown>(`${BASE}/documents/${enc(id)}/extract`, typeKey ? { typeKey } : {}).pipe(map(() => undefined)); }
  saveDraft(id: string, draft: Record<string, ReviewDecision>): Observable<{ savedAt: string }> { return this.data(this.http.put<{ data: { savedAt: string } }>(`${BASE}/documents/${enc(id)}/review`, { draft })); }
  approve(id: string, values: Record<string, FieldValue>): Observable<SmartDoc> { return this.data(this.http.post<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}/approve`, { values })); }
  archive(id: string, reason?: string): Observable<SmartDoc> { return this.data(this.http.post<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}/transition`, { to: 'archived', reason })); }
  manualEntry(id: string): Observable<SmartDoc> { return this.data(this.http.post<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}/transition`, { to: 'pending_review' })); }
  startRenewal(id: string, reason?: string): Observable<SmartDoc> { return this.data(this.http.post<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}/renew`, { reason })); }
  completeRenewal(id: string, values: Record<string, FieldValue>): Observable<SmartDoc> { return this.data(this.http.post<{ data: SmartDoc }>(`${BASE}/documents/${enc(id)}/complete-renewal`, { values })); }

  // types
  types(all = false): Observable<DocTypeDef[]> { return this.data(this.http.get<{ data: DocTypeDef[] }>(`${BASE}/types`, { params: toParams({ all: all ? 'true' : undefined }) })); }
  type(key: string): Observable<DocTypeDef> { return this.data(this.http.get<{ data: DocTypeDef }>(`${BASE}/types/${enc(key)}`)); }
  createType(input: Partial<DocTypeDef> & { key: string; label: string }): Observable<DocTypeDef> { return this.data(this.http.post<{ data: DocTypeDef }>(`${BASE}/types`, input)); }
  updateType(key: string, patch: Partial<Pick<DocTypeDef, 'label' | 'labelAr' | 'category' | 'keywords' | 'expiringSoonDays' | 'active'>>): Observable<DocTypeDef> { return this.data(this.http.patch<{ data: DocTypeDef }>(`${BASE}/types/${enc(key)}`, patch)); }
  saveFields(key: string, fields: DocField[]): Observable<DocTypeDef> { return this.data(this.http.put<{ data: DocTypeDef }>(`${BASE}/types/${enc(key)}/fields`, { fields })); }

  // reminders
  rules(p: { scope?: string; typeKey?: string; documentId?: string } = {}): Observable<ReminderRule[]> { return this.data(this.http.get<{ data: ReminderRule[] }>(`${BASE}/reminder-rules`, { params: toParams(p) })); }
  documentRules(id: string): Observable<ReminderRule[]> { return this.data(this.http.get<{ data: ReminderRule[] }>(`${BASE}/documents/${enc(id)}/reminder-rules`)); }
  createRule(input: ReminderRuleInput): Observable<ReminderRule> { return this.data(this.http.post<{ data: ReminderRule }>(`${BASE}/reminder-rules`, input)); }
  updateRule(id: string, patch: Partial<ReminderRuleInput>): Observable<ReminderRule> { return this.data(this.http.patch<{ data: ReminderRule }>(`${BASE}/reminder-rules/${enc(id)}`, patch)); }
  deleteRule(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/reminder-rules/${enc(id)}`); }
  reminders(p: { status?: string; days?: number; documentId?: string; page?: number; pageSize?: number } = {}): Observable<Page<ReminderJob>> { return this.http.get<Page<ReminderJob>>(`${BASE}/reminders`, { params: toParams(p) }); }
  acknowledge(id: string): Observable<void> { return this.http.post<unknown>(`${BASE}/reminders/${enc(id)}/acknowledge`, {}).pipe(map(() => undefined)); }
  retry(id: string): Observable<void> { return this.http.post<unknown>(`${BASE}/reminders/${enc(id)}/retry`, {}).pipe(map(() => undefined)); }
  deliveries(p: { status?: string; channel?: string; documentId?: string; page?: number; pageSize?: number } = {}): Observable<Page<Delivery>> { return this.http.get<Page<Delivery>>(`${BASE}/notifications/history`, { params: toParams(p) }); }
}
