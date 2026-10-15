import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DocRecordView, DocTypeInput, DocTypeMeta, DocTypeSummary, FieldDef, RecordData, RecordPage } from './core.models';

const BASE = '/api/v1/staff/core';

/** Document types, their custom fields and their records. Needs the real API: the mock API does not serve /core. */
@Injectable({ providedIn: 'root' })
export class CoreApiService {
  private readonly http = inject(HttpClient);

  private data<T>(o: Observable<{ data: T }>): Observable<T> {
    return o.pipe(map((r) => r.data));
  }

  doctypes(): Observable<DocTypeSummary[]> {
    return this.data(this.http.get<{ data: DocTypeSummary[] }>(`${BASE}/doctypes`));
  }

  meta(doctype: string): Observable<DocTypeMeta> {
    return this.data(this.http.get<{ data: DocTypeMeta }>(`${BASE}/meta/${encodeURIComponent(doctype)}`));
  }

  customFields(doctype: string): Observable<FieldDef[]> {
    return this.data(this.http.get<{ data: { fields: FieldDef[] } }>(`${BASE}/customize/${encodeURIComponent(doctype)}`)).pipe(map((d) => d.fields));
  }

  saveCustomFields(doctype: string, fields: FieldDef[]): Observable<FieldDef[]> {
    return this.data(this.http.put<{ data: { fields: FieldDef[] } }>(`${BASE}/customize/${encodeURIComponent(doctype)}`, { fields })).pipe(map((d) => d.fields));
  }

  createDocType(input: DocTypeInput): Observable<DocTypeSummary> {
    return this.data(this.http.post<{ data: DocTypeSummary }>(`${BASE}/doctypes`, input));
  }

  deleteDocType(name: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/doctypes/${encodeURIComponent(name)}`);
  }

  records(doctype: string, p: { q?: string; page?: number; pageSize?: number } = {}): Observable<RecordPage> {
    let params = new HttpParams();
    if (p.q) params = params.set('q', p.q);
    if (p.page) params = params.set('page', p.page);
    if (p.pageSize) params = params.set('pageSize', p.pageSize);
    return this.http.get<RecordPage>(`${BASE}/records/${encodeURIComponent(doctype)}`, { params });
  }

  record(doctype: string, name: string): Observable<DocRecordView> {
    return this.data(this.http.get<{ data: DocRecordView }>(`${BASE}/records/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`));
  }

  createRecord(doctype: string, data: RecordData): Observable<DocRecordView> {
    return this.http.post<{ data: DocRecordView; messages?: string[] }>(`${BASE}/records/${encodeURIComponent(doctype)}`, { data }).pipe(map((r) => ({ ...r.data, messages: r.messages })));
  }

  updateRecord(doctype: string, name: string, data: RecordData): Observable<DocRecordView> {
    return this.http.put<{ data: DocRecordView; messages?: string[] }>(`${BASE}/records/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { data }).pipe(map((r) => ({ ...r.data, messages: r.messages })));
  }

  deleteRecord(doctype: string, name: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/records/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  }
}
