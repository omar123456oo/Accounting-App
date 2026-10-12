import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { Bill, BillInput, ClaimInput, DocListParams, ExpenseClaim } from '../commercial/commercial.models';

const BASE = '/api/v1/staff/ledger';

/** Supplier bills and employee expense claims. */
@Injectable({ providedIn: 'root' })
export class PayablesApiService {
  private readonly http = inject(HttpClient);
  private url(ledger: string, path: string): string {
    return `${BASE}/${ledger}/commercial/${path}`;
  }
  private post<T>(ledger: string, path: string, body: object = {}): Observable<T> {
    return this.http.post<{ data: T }>(this.url(ledger, path), body, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  list(ledger: string, params: DocListParams = {}): Observable<Page<Bill>> {
    let q = new HttpParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q = q.set(k, String(v));
    return this.http.get<Page<Bill>>(this.url(ledger, 'bills'), { params: q });
  }
  get(ledger: string, id: string): Observable<Bill> {
    return this.http.get<{ data: Bill }>(this.url(ledger, `bills/${id}`)).pipe(map((r) => r.data));
  }
  create(ledger: string, input: BillInput): Observable<Bill> {
    return this.post(ledger, 'bills', input);
  }
  update(ledger: string, id: string, input: Partial<BillInput>): Observable<Bill> {
    return this.http.patch<{ data: Bill }>(this.url(ledger, `bills/${id}`), input).pipe(map((r) => r.data));
  }
  remove(ledger: string, id: string): Observable<void> {
    return this.http.delete<void>(this.url(ledger, `bills/${id}`));
  }
  submit(ledger: string, id: string): Observable<Bill> {
    return this.post(ledger, `bills/${id}/submit`);
  }
  approve(ledger: string, id: string, comment?: string): Observable<Bill> {
    return this.post(ledger, `bills/${id}/approve`, comment ? { comment } : {});
  }
  reject(ledger: string, id: string, reason: string): Observable<Bill> {
    return this.post(ledger, `bills/${id}/reject`, { reason });
  }
  cancel(ledger: string, id: string): Observable<Bill> {
    return this.post(ledger, `bills/${id}/cancel`);
  }
  rebill(ledger: string, id: string, invoiceId?: string): Observable<{ bill: Bill; invoiceId: string }> {
    return this.post(ledger, `bills/${id}/rebill`, invoiceId ? { invoiceId } : {});
  }

  claims(ledger: string, status?: string): Observable<Page<ExpenseClaim>> {
    let q = new HttpParams().set('pageSize', 100);
    if (status) q = q.set('status', status);
    return this.http.get<Page<ExpenseClaim>>(this.url(ledger, 'expense-claims'), { params: q });
  }
  createClaim(ledger: string, input: ClaimInput): Observable<ExpenseClaim> {
    return this.post(ledger, 'expense-claims', input);
  }
  approveClaim(ledger: string, id: string, comment?: string): Observable<ExpenseClaim> {
    return this.post(ledger, `expense-claims/${id}/approve`, comment ? { comment } : {});
  }
  rejectClaim(ledger: string, id: string, reason: string): Observable<ExpenseClaim> {
    return this.post(ledger, `expense-claims/${id}/reject`, { reason });
  }
  payClaim(ledger: string, id: string, input: { accountId: string; date?: string }): Observable<ExpenseClaim> {
    return this.post(ledger, `expense-claims/${id}/pay`, input);
  }
}
