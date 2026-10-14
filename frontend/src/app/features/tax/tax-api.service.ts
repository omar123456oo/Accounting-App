import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Page } from '../clients/client.models';
import {
  Adjustment,
  CalendarRule,
  CalendarRuleInput,
  CreateReturnInput,
  ComplianceSummary,
  Deadline,
  ObligationType,
  ObligationTypeInput,
  RecordOutcomeInput,
  ReturnListParams,
  RuleSet,
  RuleSetInput,
  TaxProfile,
  TaxProfileInput,
  TaxReturn,
  TaxSettings,
  WithholdingInput,
  WithholdingRecord,
  WithholdingTotals,
} from './tax.models';

const BASE = '/api/v1/staff/ledger';

/** Tax settings are organisation-wide; profiles, deadlines, returns and withholding belong to one ledger. */
@Injectable({ providedIn: 'root' })
export class TaxApiService {
  private readonly http = inject(HttpClient);

  complianceSummary(): Observable<ComplianceSummary> {
    return this.http.get<{ data: ComplianceSummary }>(`${BASE}/compliance-summary`).pipe(map((r) => r.data));
  }

  settings(): Observable<TaxSettings> {
    return this.http.get<{ data: TaxSettings }>(`${BASE}/tax-settings`).pipe(map((r) => r.data));
  }

  saveObligationType(input: ObligationTypeInput, id?: string): Observable<ObligationType> {
    return this.write<ObligationType>(`${BASE}/tax-settings/obligation-types`, input, id);
  }

  saveCalendarRule(input: Partial<CalendarRuleInput>, id?: string): Observable<CalendarRule> {
    return this.write<CalendarRule>(`${BASE}/tax-settings/calendar-rules`, input, id);
  }

  saveRuleSet(input: Partial<RuleSetInput>, id?: string): Observable<RuleSet> {
    return this.write<RuleSet>(`${BASE}/tax-settings/rule-sets`, input, id);
  }

  profile(ledger: string): Observable<TaxProfile> {
    return this.http.get<{ data: TaxProfile }>(`${BASE}/${ledger}/tax/profile`).pipe(map((r) => r.data));
  }

  saveProfile(ledger: string, input: TaxProfileInput): Observable<TaxProfile> {
    return this.http.put<{ data: TaxProfile }>(`${BASE}/${ledger}/tax/profile`, input).pipe(map((r) => r.data));
  }

  staff(): Observable<Array<{ id: string; name: string }>> {
    return this.http.get<{ data: Array<{ id: string; name: string }> }>('/api/v1/staff/assignable-users').pipe(map((r) => r.data));
  }

  deadlines(ledger: string, from?: string, to?: string): Observable<Deadline[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<{ data: Deadline[] }>(`${BASE}/${ledger}/tax/deadlines`, { params }).pipe(map((r) => r.data));
  }

  remind(ledger: string, deadlineId: string, note?: string): Observable<Deadline> {
    return this.http.post<{ data: Deadline }>(`${BASE}/${ledger}/tax/deadlines/remind`, { deadlineId, note }).pipe(map((r) => r.data));
  }

  returns(ledger: string, params: ReturnListParams = {}): Observable<Page<TaxReturn>> {
    let query = new HttpParams().set('pageSize', '100');
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query = query.set(key, String(value));
    return this.http.get<Page<TaxReturn>>(`${BASE}/${ledger}/tax/returns`, { params: query });
  }

  return(ledger: string, id: string): Observable<TaxReturn> {
    return this.http.get<{ data: TaxReturn }>(`${BASE}/${ledger}/tax/returns/${id}`).pipe(map((r) => r.data));
  }

  createReturn(ledger: string, input: CreateReturnInput): Observable<TaxReturn> {
    return this.http.post<{ data: TaxReturn }>(`${BASE}/${ledger}/tax/returns`, input).pipe(map((r) => r.data));
  }

  act(ledger: string, id: string, action: 'review' | 'return' | 'approve' | 'ready' | 'recalculate' | 'amend', body: Record<string, unknown> = {}): Observable<TaxReturn> {
    return this.http.post<{ data: TaxReturn }>(`${BASE}/${ledger}/tax/returns/${id}/${action}`, body).pipe(map((r) => r.data));
  }

  saveWorksheet(ledger: string, id: string, adjustments: Adjustment[], ruleId?: string): Observable<TaxReturn> {
    return this.http.put<{ data: TaxReturn }>(`${BASE}/${ledger}/tax/returns/${id}/worksheet`, { adjustments, ...(ruleId ? { ruleId } : {}) }).pipe(map((r) => r.data));
  }

  attach(ledger: string, id: string, file: File, name: string): Observable<TaxReturn> {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    return this.http.post<{ data: TaxReturn }>(`${BASE}/${ledger}/tax/returns/${id}/attachments`, form).pipe(map((r) => r.data));
  }

  download(ledger: string, id: string, attachmentId: string): Observable<Blob> {
    return this.http.get(`${BASE}/${ledger}/tax/returns/${id}/attachments/${attachmentId}`, { responseType: 'blob' });
  }

  recordOutcome(ledger: string, id: string, input: RecordOutcomeInput): Observable<TaxReturn> {
    const form = new FormData();
    form.append('outcome', input.outcome);
    form.append('referenceNo', input.referenceNo);
    form.append('recordedByName', input.recordedByName);
    if (input.note) form.append('note', input.note);
    form.append('evidence', input.evidence);
    return this.http.post<{ data: TaxReturn }>(`${BASE}/${ledger}/tax/returns/${id}/record-outcome`, form).pipe(map((r) => r.data));
  }

  withholding(ledger: string, from?: string, to?: string): Observable<{ rows: WithholdingRecord[]; totals: WithholdingTotals }> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<{ data: WithholdingRecord[]; meta: { totals: WithholdingTotals } }>(`${BASE}/${ledger}/tax/withholding`, { params }).pipe(map((r) => ({ rows: r.data, totals: r.meta.totals })));
  }

  addWithholding(ledger: string, input: WithholdingInput): Observable<WithholdingRecord> {
    return this.http.post<{ data: WithholdingRecord }>(`${BASE}/${ledger}/tax/withholding`, input).pipe(map((r) => r.data));
  }

  private write<T>(url: string, input: unknown, id?: string): Observable<T> {
    const request = id ? this.http.patch<{ data: T }>(`${url}/${id}`, input) : this.http.post<{ data: T }>(url, input);
    return request.pipe(map((r) => r.data));
  }
}
