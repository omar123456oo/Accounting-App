import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { JournalEntry, JournalInput, JournalListParams, RecurringTemplate } from './accounting.models';

const BASE = '/api/v1/staff/ledger';

export interface ReverseInput {
  reason: string;
  postingDate?: string;
  createReplacement?: boolean;
}

export interface ReverseResult {
  reversal: JournalEntry;
  original: JournalEntry;
  replacement?: JournalEntry;
}

/** Journal entries and their workflow. Each action is one user action, so each gets its own Idempotency-Key. */
@Injectable({ providedIn: 'root' })
export class JournalsApiService {
  private readonly http = inject(HttpClient);

  list(ledger: string, params: JournalListParams = {}): Observable<Page<JournalEntry>> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query = query.set(key, String(value));
    }
    return this.http.get<Page<JournalEntry>>(`${BASE}/${ledger}/journals`, { params: query });
  }

  get(ledger: string, id: string): Observable<JournalEntry> {
    return this.http.get<{ data: JournalEntry }>(`${BASE}/${ledger}/journals/${id}`).pipe(map((r) => r.data));
  }

  create(ledger: string, input: JournalInput): Observable<JournalEntry> {
    return this.http.post<{ data: JournalEntry }>(`${BASE}/${ledger}/journals`, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  update(ledger: string, id: string, input: Partial<JournalInput>): Observable<JournalEntry> {
    return this.http.patch<{ data: JournalEntry }>(`${BASE}/${ledger}/journals/${id}`, input).pipe(map((r) => r.data));
  }

  remove(ledger: string, id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${ledger}/journals/${id}`);
  }

  submit(ledger: string, id: string): Observable<JournalEntry> {
    return this.action(ledger, id, 'submit', {});
  }

  approve(ledger: string, id: string, comment: string): Observable<JournalEntry> {
    return this.action(ledger, id, 'approve', comment ? { comment } : {});
  }

  reject(ledger: string, id: string, reason: string): Observable<JournalEntry> {
    return this.action(ledger, id, 'reject', { reason });
  }

  post(ledger: string, id: string): Observable<JournalEntry> {
    return this.action(ledger, id, 'post', {});
  }

  reverse(ledger: string, id: string, input: ReverseInput): Observable<ReverseResult> {
    return this.http.post<{ data: ReverseResult }>(`${BASE}/${ledger}/journals/${id}/reverse`, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  templates(ledger: string): Observable<RecurringTemplate[]> {
    return this.http.get<{ data: RecurringTemplate[] }>(`${BASE}/${ledger}/recurring-templates`).pipe(map((r) => r.data));
  }

  createFromTemplate(ledger: string, templateId: string, postingDate: string): Observable<JournalEntry> {
    return this.http.post<{ data: JournalEntry }>(`${BASE}/${ledger}/recurring-templates/${templateId}/create-draft`, { postingDate }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  private action(ledger: string, id: string, name: string, body: object): Observable<JournalEntry> {
    return this.http.post<{ data: JournalEntry }>(`${BASE}/${ledger}/journals/${id}/${name}`, body, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
}
