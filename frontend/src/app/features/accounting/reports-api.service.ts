import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GeneralLedgerReport, JournalRegisterReport, TrialBalanceReport } from './accounting.models';

const BASE = '/api/v1/staff/ledger';

export interface ReportParams {
  from?: string;
  to?: string;
  includeUnposted?: boolean;
  accountId?: string;
}

/** Reports derived by the server from posted lines only; `includeUnposted` asks for a clearly marked preview. */
@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);

  generalLedger(ledger: string, params: ReportParams): Observable<GeneralLedgerReport> {
    return this.get<GeneralLedgerReport>(ledger, 'general-ledger', params);
  }

  trialBalance(ledger: string, params: ReportParams): Observable<TrialBalanceReport> {
    return this.get<TrialBalanceReport>(ledger, 'trial-balance', params);
  }

  journalRegister(ledger: string, params: ReportParams): Observable<JournalRegisterReport> {
    return this.get<JournalRegisterReport>(ledger, 'journal-register', params);
  }

  private get<T>(ledger: string, name: string, params: ReportParams): Observable<T> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '' && value !== false) query = query.set(key, String(value));
    }
    return this.http.get<{ data: T }>(`${BASE}/${ledger}/reports/${name}`, { params: query }).pipe(map((r) => r.data));
  }
}
