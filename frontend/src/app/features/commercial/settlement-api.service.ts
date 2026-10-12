import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { AllocationInput, Bill, CreditNote, CreditNoteInput, Invoice, Payment, PaymentInput, RecurringDoc, Side } from './commercial.models';

const BASE = '/api/v1/staff/ledger';

/** Payments with allocation, credit notes and recurring templates; the same shapes serve receivables and payables. */
@Injectable({ providedIn: 'root' })
export class SettlementApiService {
  private readonly http = inject(HttpClient);
  private url(ledger: string, path: string): string {
    return `${BASE}/${ledger}/commercial/${path}`;
  }
  private pay(side: Side): string {
    return side === 'ar' ? 'payments' : 'bill-payments';
  }
  private credits(side: Side): string {
    return side === 'ar' ? 'credit-notes' : 'supplier-credits';
  }
  private recurring(side: Side): string {
    return side === 'ar' ? 'recurring-invoices' : 'recurring-bills';
  }

  payments(ledger: string, side: Side, params: { page?: number; pageSize?: number; partyId?: string } = {}): Observable<Page<Payment>> {
    let q = new HttpParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q = q.set(k, String(v));
    return this.http.get<Page<Payment>>(this.url(ledger, this.pay(side)), { params: q });
  }
  payment(ledger: string, side: Side, id: string): Observable<Payment> {
    return this.http.get<{ data: Payment }>(this.url(ledger, `${this.pay(side)}/${id}`)).pipe(map((r) => r.data));
  }
  recordPayment(ledger: string, side: Side, input: PaymentInput): Observable<Payment> {
    return this.http.post<{ data: Payment }>(this.url(ledger, this.pay(side)), input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
  allocate(ledger: string, side: Side, id: string, allocations: AllocationInput[], date?: string): Observable<Payment> {
    return this.http.post<{ data: Payment }>(this.url(ledger, `${this.pay(side)}/${id}/allocate`), { allocations, ...(date ? { date } : {}) }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
  refund(ledger: string, side: Side, id: string, input: { amount: string; accountId: string; date?: string }): Observable<Payment> {
    return this.http.post<{ data: Payment }>(this.url(ledger, `${this.pay(side)}/${id}/refund`), input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  creditNotes(ledger: string, side: Side, params: { page?: number; pageSize?: number; docId?: string } = {}): Observable<Page<CreditNote>> {
    let q = new HttpParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q = q.set(k, String(v));
    return this.http.get<Page<CreditNote>>(this.url(ledger, this.credits(side)), { params: q });
  }
  createCreditNote(ledger: string, side: Side, input: CreditNoteInput): Observable<{ creditNote: CreditNote; document: Invoice | Bill }> {
    return this.http.post<{ data: { creditNote: CreditNote; document: Invoice | Bill } }>(this.url(ledger, this.credits(side)), input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  recurringTemplates(ledger: string, side: Side): Observable<RecurringDoc[]> {
    return this.http.get<{ data: RecurringDoc[] }>(this.url(ledger, this.recurring(side))).pipe(map((r) => r.data));
  }
  createDraftFromTemplate(ledger: string, side: Side, id: string, date: string): Observable<Invoice | Bill> {
    return this.http.post<{ data: Invoice | Bill }>(this.url(ledger, `${this.recurring(side)}/${id}/create-draft`), { date }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
}
