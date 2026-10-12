import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../core/http/idempotency.interceptor';
import { Page } from '../clients/client.models';
import { Task, TaskInput, TaskListParams } from './workflows.models';

const BASE = '/api/v1/staff/tasks';

@Injectable({ providedIn: 'root' })
export class TasksApiService {
  private readonly http = inject(HttpClient);

  list(params: TaskListParams = {}): Observable<Page<Task>> {
    let query = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') query = query.set(key, String(value));
    }
    return this.http.get<Page<Task>>(BASE, { params: query });
  }

  get(id: string): Observable<Task> {
    return this.http.get<{ data: Task }>(`${BASE}/${id}`).pipe(map((r) => r.data));
  }

  create(input: TaskInput): Observable<Task> {
    return this.http.post<{ data: Task }>(BASE, input, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  update(id: string, input: Partial<TaskInput>): Observable<Task> {
    return this.http.patch<{ data: Task }>(`${BASE}/${id}`, input).pipe(map((r) => r.data));
  }

  comment(id: string, body: string): Observable<Task> {
    return this.http.post<{ data: Task }>(`${BASE}/${id}/comments`, { body }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  reassign(id: string, assigneeId: string, reason: string): Observable<Task> {
    return this.http.post<{ data: Task }>(`${BASE}/${id}/reassign`, { assigneeId, reason }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
}
