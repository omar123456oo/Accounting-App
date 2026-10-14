import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EmployeeInput, EmployeeListParams, EmployeeProfile, HrSettings, LeaveApplication, LeaveBalance, LeaveInput, LeaveListParams, LeaveType, LeaveTypeInput, PayrollRun, PayrollRunSummary, PayrollSlip, Salary, SalaryInput } from './hr.models';

const BASE = '/api/v1/staff/hr';

@Injectable({ providedIn: 'root' })
export class HrApiService {
  private readonly http = inject(HttpClient);

  private data<T>(o: Observable<{ data: T }>): Observable<T> {
    return o.pipe(map((r) => r.data));
  }

  employees(p: EmployeeListParams = {}): Observable<EmployeeProfile[]> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(p)) if (v) params = params.set(k, v);
    return this.data(this.http.get<{ data: EmployeeProfile[] }>(`${BASE}/employees`, { params }));
  }

  employee(id: string): Observable<EmployeeProfile> {
    return this.data(this.http.get<{ data: EmployeeProfile }>(`${BASE}/employees/${id}`));
  }

  saveEmployee(id: string, input: EmployeeInput): Observable<EmployeeProfile> {
    return this.data(this.http.put<{ data: EmployeeProfile }>(`${BASE}/employees/${id}`, input));
  }

  salary(id: string): Observable<Salary> {
    return this.data(this.http.get<{ data: Salary }>(`${BASE}/employees/${id}/salary`));
  }

  saveSalary(id: string, input: SalaryInput): Observable<Salary> {
    return this.data(this.http.put<{ data: Salary }>(`${BASE}/employees/${id}/salary`, input));
  }

  leaveTypes(): Observable<LeaveType[]> {
    return this.data(this.http.get<{ data: LeaveType[] }>(`${BASE}/leave-types`));
  }

  saveLeaveType(input: LeaveTypeInput, id?: string): Observable<LeaveType> {
    return this.data(id ? this.http.put<{ data: LeaveType }>(`${BASE}/leave-types/${id}`, input) : this.http.post<{ data: LeaveType }>(`${BASE}/leave-types`, input));
  }

  balances(userId?: string, year?: number): Observable<LeaveBalance[]> {
    let params = new HttpParams();
    if (userId) params = params.set('userId', userId);
    if (year) params = params.set('year', year);
    return this.data(this.http.get<{ data: LeaveBalance[] }>(`${BASE}/leave-balances`, { params }));
  }

  leave(p: LeaveListParams = {}): Observable<LeaveApplication[]> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(p)) if (v) params = params.set(k, v);
    return this.data(this.http.get<{ data: LeaveApplication[] }>(`${BASE}/leave`, { params }));
  }

  apply(input: LeaveInput): Observable<LeaveApplication> {
    return this.data(this.http.post<{ data: LeaveApplication }>(`${BASE}/leave`, input));
  }

  decide(id: string, action: 'approve' | 'reject', note: string): Observable<LeaveApplication> {
    return this.data(this.http.post<{ data: LeaveApplication }>(`${BASE}/leave/${id}/${action}`, { note }));
  }

  cancel(id: string): Observable<LeaveApplication> {
    return this.data(this.http.post<{ data: LeaveApplication }>(`${BASE}/leave/${id}/cancel`, {}));
  }

  settings(): Observable<HrSettings> {
    return this.data(this.http.get<{ data: HrSettings }>(`${BASE}/settings`));
  }

  saveSettings(input: HrSettings): Observable<HrSettings> {
    return this.data(this.http.put<{ data: HrSettings }>(`${BASE}/settings`, input));
  }

  runs(): Observable<PayrollRunSummary[]> {
    return this.data(this.http.get<{ data: PayrollRunSummary[] }>(`${BASE}/payroll/runs`));
  }

  run(month: string): Observable<PayrollRun> {
    return this.data(this.http.get<{ data: PayrollRun }>(`${BASE}/payroll/runs/${month}`));
  }

  generate(month: string): Observable<PayrollRun> {
    return this.data(this.http.post<{ data: PayrollRun }>(`${BASE}/payroll/runs`, { month }));
  }

  finalize(month: string): Observable<PayrollRun> {
    return this.data(this.http.post<{ data: PayrollRun }>(`${BASE}/payroll/runs/${month}/finalize`, {}));
  }

  slips(userId?: string): Observable<PayrollSlip[]> {
    const params = userId ? new HttpParams().set('userId', userId) : new HttpParams();
    return this.data(this.http.get<{ data: PayrollSlip[] }>(`${BASE}/payroll/slips`, { params }));
  }
}
