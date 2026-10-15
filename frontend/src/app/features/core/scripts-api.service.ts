import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ClientScript } from './client-script-runtime';

const BASE = '/api/v1/staff/core/scripts';
const enc = encodeURIComponent;

export type ScriptKind = 'server' | 'client';
export const SERVER_EVENTS = ['before_save', 'after_save', 'before_delete', 'before_action', 'after_action'] as const;
export type ServerEvent = (typeof SERVER_EVENTS)[number];

export interface ScriptDef {
  id: string; doctype: string; kind: ScriptKind; name: string; event: ServerEvent | null; code: string; enabled: boolean; order: number;
  description: string | null; version: number; updatedAt?: string;
}
export interface ScriptInput { doctype?: string; kind?: ScriptKind; name?: string; event?: ServerEvent | null; code?: string; enabled?: boolean; order?: number; description?: string }
export type TestResult =
  | { ok: true; doc: { data: Record<string, unknown> }; messages: string[]; logs: string[]; durationMs: number }
  | { ok: false; kind: 'validation' | 'error' | 'timeout' | 'memory'; message: string; messages: string[]; logs: string[]; durationMs: number };
export interface ScriptLogRow { at: string; event: string; record: string | null; ok: boolean; kind: string | null; message: string | null; durationMs: number; logs: string[]; messages: string[] }

/** Scripts attached to document types. Reading and writing code needs developer.scripts; the browser-side scripts of a type go to anyone who may view it. */
@Injectable({ providedIn: 'root' })
export class ScriptsApiService {
  private readonly http = inject(HttpClient);

  /** The enabled client scripts of a type. A failure means "no scripts": a form must still open. */
  clientScripts(doctype: string): Observable<ClientScript[]> {
    return this.http.get<{ data: ClientScript[] }>(`${BASE}/client/${enc(doctype)}`).pipe(map((r) => r.data), catchError(() => of([] as ClientScript[])));
  }

  list(doctype?: string): Observable<ScriptDef[]> {
    let params = new HttpParams();
    if (doctype) params = params.set('doctype', doctype);
    return this.http.get<{ data: ScriptDef[] }>(BASE, { params }).pipe(map((r) => r.data));
  }

  create(input: ScriptInput): Observable<ScriptDef> {
    return this.http.post<{ data: ScriptDef }>(BASE, input).pipe(map((r) => r.data));
  }

  update(id: string, input: ScriptInput): Observable<ScriptDef> {
    return this.http.put<{ data: ScriptDef }>(`${BASE}/${enc(id)}`, input).pipe(map((r) => r.data));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${enc(id)}`);
  }

  test(id: string, doc: { name?: string; state?: string; data: Record<string, unknown> }, action?: string): Observable<TestResult> {
    return this.http.post<{ data: TestResult }>(`${BASE}/${enc(id)}/test`, { doc, ...(action ? { action } : {}) }).pipe(map((r) => r.data));
  }

  logs(id: string): Observable<ScriptLogRow[]> {
    return this.http.get<{ data: ScriptLogRow[] }>(`${BASE}/${enc(id)}/logs`).pipe(map((r) => r.data));
  }
}
