import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Contract, ContractInput, ContractStatus, DepartmentNode, EmployeeLite, HrDashboard, OrgKind, Page } from './hrm.models';

const BASE = '/api/v1/staff/hrm';

/** The HR core API: dashboard, organization structure, the employee directory and contracts. */
@Injectable({ providedIn: 'root' })
export class HrmApiService {
  private readonly http = inject(HttpClient);

  dashboard(expiringInDays = 60): Observable<HrDashboard> {
    return this.http.get<{ data: HrDashboard }>(`${BASE}/dashboard`, { params: { expiringInDays } }).pipe(map((r) => r.data));
  }

  org<T>(kind: OrgKind): Observable<T[]> {
    return this.http.get<{ data: T[] }>(`${BASE}/${kind}`).pipe(map((r) => r.data));
  }

  departmentTree(): Observable<DepartmentNode[]> {
    return this.http.get<{ data: DepartmentNode[] }>(`${BASE}/departments-tree`).pipe(map((r) => r.data));
  }

  saveOrg<T>(kind: OrgKind, input: Record<string, unknown>, id?: string): Observable<T> {
    const request = id ? this.http.patch<{ data: T }>(`${BASE}/${kind}/${id}`, input) : this.http.post<{ data: T }>(`${BASE}/${kind}`, input);
    return request.pipe(map((r) => r.data));
  }

  employees(params: { q?: string; status?: string; page?: number; pageSize?: number } = {}): Observable<Page<EmployeeLite>> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p = p.set(k, String(v));
    return this.http.get<Page<EmployeeLite>>(`${BASE}/employees`, { params: p });
  }

  contracts(params: { status?: ContractStatus | ''; expiringInDays?: number; page?: number; pageSize?: number } = {}): Observable<Page<Contract>> {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p = p.set(k, String(v));
    return this.http.get<Page<Contract>>(`${BASE}/contracts`, { params: p });
  }

  createContract(input: ContractInput): Observable<Contract> {
    return this.http.post<{ data: Contract }>(`${BASE}/contracts`, input).pipe(map((r) => r.data));
  }

  contractAction(id: string, action: 'activate' | 'renew' | 'terminate', body: Record<string, unknown> = {}): Observable<Contract> {
    return this.http.post<{ data: Contract }>(`${BASE}/contracts/${id}/${action}`, body).pipe(map((r) => r.data));
  }
}
