import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import {
  AssignableUser,
  Client,
  ClientChangeEvent,
  ClientInput,
  ClientListParams,
  ClientStatus,
  Page,
  SubResource,
} from './client.models';

const BASE = '/api/v1/staff/clients';

@Injectable({ providedIn: 'root' })
export class ClientsApiService {
  private readonly http = inject(HttpClient);

  list(params: ClientListParams = {}): Observable<Page<Client>> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        query = query.set(key, String(value));
      }
    }
    return this.http.get<Page<Client>>(BASE, { params: query });
  }

  get(id: string): Observable<Client> {
    return this.http.get<{ data: Client }>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(input: ClientInput): Observable<Client> {
    return this.http.post<{ data: Client }>(BASE, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  update(id: string, input: Partial<ClientInput>): Observable<Client> {
    return this.http.patch<{ data: Client }>(`${BASE}/${id}`, input).pipe(map((r) => r.data));
  }

  changeStatus(id: string, status: ClientStatus): Observable<Client> {
    return this.http.patch<{ data: Client }>(`${BASE}/${id}`, { status }).pipe(map((r) => r.data));
  }

  archive(id: string, archived: boolean): Observable<Client> {
    return this.http.post<{ data: Client }>(`${BASE}/${id}/archive`, { archived }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  history(id: string): Observable<ClientChangeEvent[]> {
    return this.http.get<{ data: ClientChangeEvent[] }>(`${BASE}/${id}/history`).pipe(map((r) => r.data));
  }

  assignableUsers(): Observable<AssignableUser[]> {
    return this.http.get<{ data: AssignableUser[] }>('/api/v1/staff/assignable-users').pipe(map((r) => r.data));
  }

  listSub<T>(id: string, resource: SubResource): Observable<T[]> {
    return this.http.get<{ data: T[] }>(`${BASE}/${id}/${resource}`).pipe(map((r) => r.data));
  }

  createSub<T>(id: string, resource: SubResource, body: object): Observable<T> {
    return this.http.post<{ data: T }>(`${BASE}/${id}/${resource}`, body, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  updateSub<T>(id: string, resource: SubResource, subId: string, body: object): Observable<T> {
    return this.http.put<{ data: T }>(`${BASE}/${id}/${resource}/${subId}`, body).pipe(map((r) => r.data));
  }

  deleteSub(id: string, resource: SubResource, subId: string): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}/${resource}/${subId}`);
  }
}
