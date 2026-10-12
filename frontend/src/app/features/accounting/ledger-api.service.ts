import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Account, AccountInput, AccountingPeriod, FiscalYear, LedgerEntity, LedgerSummary } from './accounting.models';

const BASE = '/api/v1/staff/ledger';

/** Ledger entities, chart of accounts, fiscal years and periods. Every call is scoped to one ledger entity. */
@Injectable({ providedIn: 'root' })
export class LedgerApiService {
  private readonly http = inject(HttpClient);

  entities(): Observable<LedgerEntity[]> {
    return this.http.get<{ data: LedgerEntity[] }>(`${BASE}/entities`).pipe(map((r) => r.data));
  }

  summary(): Observable<LedgerSummary> {
    return this.http.get<{ data: LedgerSummary }>(`${BASE}/summary`).pipe(map((r) => r.data));
  }

  accounts(ledger: string): Observable<Account[]> {
    return this.http.get<{ data: Account[] }>(`${BASE}/${ledger}/accounts`).pipe(map((r) => r.data));
  }

  createAccount(ledger: string, input: AccountInput): Observable<Account> {
    return this.http.post<{ data: Account }>(`${BASE}/${ledger}/accounts`, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  updateAccount(ledger: string, id: string, input: AccountInput): Observable<Account> {
    return this.http.patch<{ data: Account }>(`${BASE}/${ledger}/accounts/${id}`, input).pipe(map((r) => r.data));
  }

  importTemplate(ledger: string): Observable<number> {
    return this.http.post<{ meta: { created: number } }>(`${BASE}/${ledger}/accounts/import-template`, {}, { context: idempotentContext() }).pipe(map((r) => r.meta.created));
  }

  fiscalYears(ledger: string): Observable<FiscalYear[]> {
    return this.http.get<{ data: FiscalYear[] }>(`${BASE}/${ledger}/fiscal-years`).pipe(map((r) => r.data));
  }

  createFiscalYear(ledger: string, input: { name: string; startDate: string }): Observable<FiscalYear> {
    return this.http.post<{ data: { year: FiscalYear } }>(`${BASE}/${ledger}/fiscal-years`, input, { context: idempotentContext() }).pipe(map((r) => r.data.year));
  }

  periods(ledger: string): Observable<AccountingPeriod[]> {
    return this.http.get<{ data: AccountingPeriod[] }>(`${BASE}/${ledger}/periods`).pipe(map((r) => r.data));
  }

  changePeriod(ledger: string, id: string, action: 'close' | 'lock' | 'reopen', reason?: string): Observable<AccountingPeriod> {
    return this.http.post<{ data: AccountingPeriod }>(`${BASE}/${ledger}/periods/${id}/${action}`, reason ? { reason } : {}, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
}
