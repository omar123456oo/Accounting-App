import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { DocRecordView } from './core.models';
import { AppNotification, Delegation, Directory, InboxItem, Person, WorkflowDefinition } from './workflow.models';

const BASE = '/api/v1/staff/core';
const enc = encodeURIComponent;

/** Workflow definitions, actions on records, the inbox, delegations and notifications. Needs the real API. */
@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly http = inject(HttpClient);

  private data<T>(o: Observable<{ data: T }>): Observable<T> {
    return o.pipe(map((r) => r.data));
  }

  directory(): Observable<Directory> {
    return this.data(this.http.get<{ data: Directory }>(`${BASE}/directory`));
  }

  /** Colleagues (id and name) for pickers that any staff member may use. */
  people(): Observable<Person[]> {
    return this.data(this.http.get<{ data: Person[] }>(`${BASE}/people`));
  }

  /** The workflow of a type, or null when it has none yet. */
  workflow(doctype: string): Observable<WorkflowDefinition | null> {
    return this.data(this.http.get<{ data: WorkflowDefinition }>(`${BASE}/workflows/${enc(doctype)}`)).pipe(
      catchError((e: unknown) => (e instanceof HttpErrorResponse && e.status === 404 ? of(null) : throwAgain(e))),
    );
  }

  saveWorkflow(doctype: string, def: WorkflowDefinition): Observable<WorkflowDefinition> {
    return this.data(this.http.put<{ data: WorkflowDefinition }>(`${BASE}/workflows/${enc(doctype)}`, def));
  }

  /** `pending` is set when more approvals are still needed before the record moves. */
  act(doctype: string, name: string, action: string, comment?: string): Observable<{ record: DocRecordView; pending?: number }> {
    return this.http
      .post<{ data: DocRecordView; pending?: number }>(`${BASE}/records/${enc(doctype)}/${enc(name)}/actions`, { action, ...(comment ? { comment } : {}) })
      .pipe(map((r) => ({ record: r.data, pending: r.pending })));
  }

  inbox(): Observable<InboxItem[]> {
    return this.data(this.http.get<{ data: InboxItem[] }>(`${BASE}/workflow/inbox`));
  }

  delegations(): Observable<Delegation[]> {
    return this.data(this.http.get<{ data: Delegation[] }>(`${BASE}/workflow/delegations`));
  }

  addDelegation(body: { toUserId: string; startDate: string; endDate: string }): Observable<Delegation> {
    return this.data(this.http.post<{ data: Delegation }>(`${BASE}/workflow/delegations`, body));
  }

  endDelegation(id: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/workflow/delegations/${enc(id)}`);
  }

  notifications(unreadOnly = false): Observable<AppNotification[]> {
    let params = new HttpParams();
    if (unreadOnly) params = params.set('unread', '1');
    return this.data(this.http.get<{ data: AppNotification[] }>(`${BASE}/notifications`, { params }));
  }

  markRead(id: string): Observable<void> {
    return this.http.post<unknown>(`${BASE}/notifications/${enc(id)}/read`, {}).pipe(map(() => undefined));
  }
}

function throwAgain(e: unknown): Observable<never> {
  return new Observable((s) => s.error(e));
}
