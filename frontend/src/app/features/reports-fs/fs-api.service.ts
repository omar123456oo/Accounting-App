import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FsLineKey, FsMapping, FsOptions, StatementKind, StatementParams, StatementView } from './fs.models';

const BASE = '/api/v1/staff/ledger';

/** Statements are computed by the server from posted ledger lines; the client never re-derives them. */
@Injectable({ providedIn: 'root' })
export class FsApiService {
  private readonly http = inject(HttpClient);

  statement(ledger: string, kind: StatementKind, params: StatementParams): Observable<StatementView> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '' && value !== false) query = query.set(key, String(value));
    }
    return this.http.get<{ data: StatementView }>(`${BASE}/${ledger}/statements/${kind}`, { params: query }).pipe(map((r) => r.data));
  }

  options(ledger: string): Observable<FsOptions> {
    return this.http.get<{ data: FsOptions }>(`${BASE}/${ledger}/statements/options`).pipe(map((r) => r.data));
  }

  mapping(ledger: string): Observable<FsMapping> {
    return this.http.get<{ data: FsMapping }>(`${BASE}/${ledger}/statements/mapping`).pipe(map((r) => r.data));
  }

  saveMapping(ledger: string, mapping: Record<string, FsLineKey>): Observable<FsMapping> {
    return this.http.put<{ data: FsMapping }>(`${BASE}/${ledger}/statements/mapping`, { mapping }).pipe(map((r) => r.data));
  }
}
