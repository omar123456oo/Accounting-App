import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import {
  AccountMappings,
  AgingReport,
  BudgetReport,
  CommercialSettings,
  CommercialSummary,
  ExpenseCategory,
  ExpenseCategoryInput,
  MappingsInput,
  Party,
  PartyInput,
  ReconciliationReport,
  RevenueBy,
  RevenueReport,
  ScheduleItem,
  ServiceType,
  ServiceTypeInput,
  Side,
  Statement,
  TaxRate,
  TaxRateInput,
} from './commercial.models';

const BASE = '/api/v1/staff/ledger';

function query(params: Record<string, string | number | undefined>): HttpParams {
  let q = new HttpParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q = q.set(k, String(v));
  return q;
}

/** Reference data (tax rates, mappings, service types, categories), parties and the commercial reports. */
@Injectable({ providedIn: 'root' })
export class CommercialApiService {
  private readonly http = inject(HttpClient);
  private url(ledger: string, path: string): string {
    return `${BASE}/${ledger}/commercial/${path}`;
  }
  private get<T>(ledger: string, path: string, params: Record<string, string | number | undefined> = {}): Observable<T> {
    return this.http.get<{ data: T }>(this.url(ledger, path), { params: query(params) }).pipe(map((r) => r.data));
  }

  taxRates(): Observable<TaxRate[]> {
    return this.http.get<{ data: TaxRate[] }>(`${BASE}/tax-rates`).pipe(map((r) => r.data));
  }
  createTaxRate(input: TaxRateInput): Observable<TaxRate> {
    return this.http.post<{ data: TaxRate }>(`${BASE}/tax-rates`, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
  updateTaxRate(id: string, input: Partial<TaxRateInput>): Observable<TaxRate> {
    return this.http.patch<{ data: TaxRate }>(`${BASE}/tax-rates/${id}`, input).pipe(map((r) => r.data));
  }

  settings(ledger: string): Observable<CommercialSettings> {
    return this.get(ledger, 'settings');
  }
  updateSettings(ledger: string, input: { allowDraftRates: boolean }): Observable<CommercialSettings> {
    return this.http.patch<{ data: CommercialSettings }>(this.url(ledger, 'settings'), input).pipe(map((r) => r.data));
  }
  mappings(ledger: string): Observable<AccountMappings> {
    return this.get(ledger, 'mappings');
  }
  saveMappings(ledger: string, input: MappingsInput): Observable<AccountMappings> {
    return this.http.patch<{ data: AccountMappings }>(this.url(ledger, 'mappings'), input).pipe(map((r) => r.data));
  }

  serviceTypes(ledger: string): Observable<ServiceType[]> {
    return this.get(ledger, 'service-types');
  }
  createServiceType(ledger: string, input: ServiceTypeInput): Observable<ServiceType> {
    return this.http.post<{ data: ServiceType }>(this.url(ledger, 'service-types'), input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
  updateServiceType(ledger: string, id: string, input: Partial<ServiceTypeInput>): Observable<ServiceType> {
    return this.http.patch<{ data: ServiceType }>(this.url(ledger, `service-types/${id}`), input).pipe(map((r) => r.data));
  }
  categories(ledger: string): Observable<ExpenseCategory[]> {
    return this.get(ledger, 'expense-categories');
  }
  createCategory(ledger: string, input: ExpenseCategoryInput): Observable<ExpenseCategory> {
    return this.http.post<{ data: ExpenseCategory }>(this.url(ledger, 'expense-categories'), input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
  updateCategory(ledger: string, id: string, input: Partial<ExpenseCategoryInput>): Observable<ExpenseCategory> {
    return this.http.patch<{ data: ExpenseCategory }>(this.url(ledger, `expense-categories/${id}`), input).pipe(map((r) => r.data));
  }

  parties(ledger: string, side: Side, params: { q?: string; archived?: boolean } = {}): Observable<Party[]> {
    return this.get(ledger, side === 'ar' ? 'customers' : 'suppliers', { q: params.q, archived: params.archived ? 'true' : undefined });
  }
  party(ledger: string, side: Side, id: string): Observable<Party> {
    return this.get(ledger, `${side === 'ar' ? 'customers' : 'suppliers'}/${id}`);
  }
  createParty(ledger: string, side: Side, input: PartyInput): Observable<Party> {
    return this.http.post<{ data: Party }>(this.url(ledger, side === 'ar' ? 'customers' : 'suppliers'), input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
  updateParty(ledger: string, side: Side, id: string, input: PartyInput): Observable<Party> {
    return this.http.patch<{ data: Party }>(this.url(ledger, `${side === 'ar' ? 'customers' : 'suppliers'}/${id}`), input).pipe(map((r) => r.data));
  }

  aging(ledger: string, side: Side, asOf?: string): Observable<AgingReport> {
    return this.get(ledger, 'reports/aging', { side, asOf });
  }
  statement(ledger: string, side: Side, partyId: string, from?: string, to?: string): Observable<Statement> {
    return this.get(ledger, 'reports/statement', { side, partyId, from, to });
  }
  revenue(ledger: string, by: RevenueBy, from?: string, to?: string): Observable<RevenueReport> {
    return this.get(ledger, 'reports/revenue', { by, from, to });
  }
  reconciliation(ledger: string): Observable<ReconciliationReport> {
    return this.get(ledger, 'reports/reconciliation');
  }
  budget(ledger: string, month?: string): Observable<BudgetReport> {
    return this.get(ledger, 'reports/budget', { month });
  }
  schedule(ledger: string, days = 30): Observable<ScheduleItem[]> {
    return this.get(ledger, 'reports/payment-schedule', { days });
  }

  summary(): Observable<CommercialSummary> {
    return this.http.get<{ data: CommercialSummary }>(`${BASE}/commercial-summary`).pipe(map((r) => r.data));
  }
}

/** The server's business date for a ledger, fetched once per session: documents default to it instead of the browser clock. */
@Injectable({ providedIn: 'root' })
export class BusinessClock {
  private readonly api = inject(CommercialApiService);
  private readonly cache = new Map<string, Observable<string>>();

  today(ledger: string): Observable<string> {
    let today$ = this.cache.get(ledger);
    if (!today$) {
      today$ = this.api.settings(ledger).pipe(
        map((s) => s.today),
        shareReplay(1),
      );
      this.cache.set(ledger, today$);
    }
    return today$;
  }
}
