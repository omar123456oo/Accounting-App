import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { idempotentContext } from '../../../core/http/idempotency.interceptor';
import { AdvanceTarget, ChecklistItem, ChecklistStatus, OnboardingCase } from './onboarding.models';

const base = (clientId: string) => `/api/v1/staff/clients/${clientId}/onboarding`;

@Injectable({ providedIn: 'root' })
export class OnboardingApiService {
  private readonly http = inject(HttpClient);

  get(clientId: string): Observable<OnboardingCase> {
    return this.http.get<{ data: OnboardingCase }>(base(clientId)).pipe(map((r) => r.data));
  }

  start(clientId: string): Observable<OnboardingCase> {
    return this.http.post<{ data: OnboardingCase }>(base(clientId), {}, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  setFlags(clientId: string, flags: { identityVerified?: boolean; engagementAccepted?: boolean }): Observable<OnboardingCase> {
    return this.http.patch<{ data: OnboardingCase }>(base(clientId), flags).pipe(map((r) => r.data));
  }

  updateItem(clientId: string, itemId: string, change: { status?: ChecklistStatus; documentId?: string | null }): Observable<OnboardingCase> {
    return this.http.patch<{ data: OnboardingCase }>(`${base(clientId)}/checklist/${itemId}`, change).pipe(map((r) => r.data));
  }

  addItem(clientId: string, item: Pick<ChecklistItem, 'label' | 'required'>): Observable<OnboardingCase> {
    return this.http.post<{ data: OnboardingCase }>(`${base(clientId)}/checklist`, item, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  removeItem(clientId: string, itemId: string): Observable<OnboardingCase> {
    return this.http.delete<{ data: OnboardingCase }>(`${base(clientId)}/checklist/${itemId}`).pipe(map((r) => r.data));
  }

  advance(clientId: string, to: AdvanceTarget, comment?: string): Observable<OnboardingCase> {
    const body = comment ? { to, comment } : { to };
    return this.http.post<{ data: OnboardingCase }>(`${base(clientId)}/advance`, body, { context: idempotentContext() }).pipe(map((r) => r.data));
  }

  reject(clientId: string, comment: string): Observable<OnboardingCase> {
    return this.http.post<{ data: OnboardingCase }>(`${base(clientId)}/reject`, { comment }, { context: idempotentContext() }).pipe(map((r) => r.data));
  }
}
