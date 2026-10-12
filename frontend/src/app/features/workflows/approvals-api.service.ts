import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { ApprovalItem, ApprovalStatus } from './workflows.models';

const BASE = '/api/v1/staff/approvals';

@Injectable({ providedIn: 'root' })
export class ApprovalsApiService {
  private readonly http = inject(HttpClient);

  list(params: { status?: ApprovalStatus | ''; page?: number; pageSize?: number } = {}): Observable<Page<ApprovalItem>> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query = query.set(key, String(value));
    }
    return this.http.get<Page<ApprovalItem>>(BASE, { params: query });
  }

  approve(id: string, comment?: string): Observable<ApprovalItem> {
    return this.http.post<{ data: ApprovalItem }>(`${BASE}/${id}/approve`, { comment: comment ?? '' }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  reject(id: string, comment: string): Observable<ApprovalItem> {
    return this.http.post<{ data: ApprovalItem }>(`${BASE}/${id}/reject`, { comment }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
}
