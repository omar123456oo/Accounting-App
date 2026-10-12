import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { DocListParams, Invoice, InvoiceInput, Quotation, QuotationInput } from '../commercial/commercial.models';

const BASE = '/api/v1/staff/ledger';

/** Invoices and quotations. Each workflow action is one POST with its own Idempotency-Key. */
@Injectable({ providedIn: 'root' })
export class InvoicingApiService {
  private readonly http = inject(HttpClient);
  private url(ledger: string, path: string): string {
    return `${BASE}/${ledger}/commercial/${path}`;
  }
  private post<T>(ledger: string, path: string, body: object = {}): Observable<T> {
    return this.http.post<{ data: T }>(this.url(ledger, path), body, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  list(ledger: string, params: DocListParams = {}): Observable<Page<Invoice>> {
    let q = new HttpParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q = q.set(k, String(v));
    return this.http.get<Page<Invoice>>(this.url(ledger, 'invoices'), { params: q });
  }
  get(ledger: string, id: string): Observable<Invoice> {
    return this.http.get<{ data: Invoice }>(this.url(ledger, `invoices/${id}`)).pipe(map((r) => r.data));
  }
  create(ledger: string, input: InvoiceInput): Observable<Invoice> {
    return this.post(ledger, 'invoices', input);
  }
  update(ledger: string, id: string, input: Partial<InvoiceInput>): Observable<Invoice> {
    return this.http.patch<{ data: Invoice }>(this.url(ledger, `invoices/${id}`), input).pipe(map((r) => r.data));
  }
  remove(ledger: string, id: string): Observable<void> {
    return this.http.delete<void>(this.url(ledger, `invoices/${id}`));
  }
  submit(ledger: string, id: string): Observable<Invoice> {
    return this.post(ledger, `invoices/${id}/submit`);
  }
  approve(ledger: string, id: string, comment?: string): Observable<Invoice> {
    return this.post(ledger, `invoices/${id}/approve`, comment ? { comment } : {});
  }
  reject(ledger: string, id: string, reason: string): Observable<Invoice> {
    return this.post(ledger, `invoices/${id}/reject`, { reason });
  }
  issue(ledger: string, id: string): Observable<Invoice> {
    return this.post(ledger, `invoices/${id}/issue`);
  }
  cancel(ledger: string, id: string, reason?: string): Observable<Invoice> {
    return this.post(ledger, `invoices/${id}/cancel`, reason ? { reason } : {});
  }
  remind(ledger: string, id: string, note?: string): Observable<Invoice> {
    return this.post(ledger, `invoices/${id}/remind`, note ? { note } : {});
  }
  recognize(ledger: string, id: string, upTo: string): Observable<{ invoice: Invoice; recognized: number }> {
    return this.http.post<{ data: Invoice; meta: { recognized: number } }>(this.url(ledger, `invoices/${id}/recognize`), { upTo }, { context: idempotentContext() }).pipe(map((r) => ({ invoice: r.data, recognized: r.meta.recognized })));
  }

  quotations(ledger: string, status?: string): Observable<Page<Quotation>> {
    return this.http.get<Page<Quotation>>(this.url(ledger, 'quotations'), { params: status ? new HttpParams().set('status', status).set('pageSize', 100) : new HttpParams().set('pageSize', 100) });
  }
  createQuotation(ledger: string, input: QuotationInput): Observable<Quotation> {
    return this.post(ledger, 'quotations', input);
  }
  moveQuotation(ledger: string, id: string, action: 'send' | 'accept' | 'reject'): Observable<Quotation> {
    return this.post(ledger, `quotations/${id}/${action}`);
  }
  convertQuotation(ledger: string, id: string): Observable<{ quotation: Quotation; invoiceId: string }> {
    return this.post(ledger, `quotations/${id}/convert`);
  }
}
