import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { HrApiService } from './hr-api.service';
import { HrFormat } from './hr-format';
import { EMPLOYEE_STATUSES, EmployeeProfile, EmployeeStatus } from './hr.models';

/** Every employee's file in one list. Search and filter run on the loaded list. Salaries are never shown here. */
@Component({
  selector: 'app-employee-list',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge],
  template: `
    <app-page-header [title]="'hr.employees.title' | translate" />
    <div class="row g-2 mb-3">
      <div class="col-md-5">
        <label for="emp-q" class="visually-hidden">{{ 'hr.employees.search' | translate }}</label>
        <input id="emp-q" class="form-control" type="search" [placeholder]="'hr.employees.search' | translate" [value]="q()" (input)="q.set($any($event.target).value)" />
      </div>
      <div class="col-6 col-md-3">
        <label for="emp-dept" class="visually-hidden">{{ 'hr.fields.department' | translate }}</label>
        <select id="emp-dept" class="form-select" [value]="department()" (change)="department.set($any($event.target).value)">
          <option value="">{{ 'hr.employees.anyDepartment' | translate }}</option>
          @for (d of departments(); track d) {
            <option [value]="d">{{ d }}</option>
          }
        </select>
      </div>
      <div class="col-6 col-md-3">
        <label for="emp-status" class="visually-hidden">{{ 'hr.fields.status' | translate }}</label>
        <select id="emp-status" class="form-select" [value]="status()" (change)="status.set($any($event.target).value)">
          <option value="">{{ 'hr.employees.anyStatus' | translate }}</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ 'hr.employees.status.' + s | translate }}</option>
          }
        </select>
      </div>
    </div>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (all() === null) {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    } @else {
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <caption class="visually-hidden">{{ 'hr.employees.title' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'hr.fields.employee' | translate }}</th>
              <th scope="col">{{ 'hr.fields.jobTitle' | translate }}</th>
              <th scope="col">{{ 'hr.fields.department' | translate }}</th>
              <th scope="col">{{ 'hr.fields.hireDate' | translate }}</th>
              <th scope="col">{{ 'hr.fields.status' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (e of rows(); track e.userId) {
              <tr>
                <td>
                  <a [routerLink]="['/app/hr/employees', e.userId]" class="fw-semibold text-decoration-none">{{ e.name }}</a>
                  <div class="small text-body-secondary" dir="ltr">{{ e.email }}</div>
                </td>
                <td>{{ e.jobTitle }}</td>
                <td>{{ e.department }}</td>
                <td>{{ format.date(e.hireDate) }}</td>
                <td>
                  <app-status-badge [label]="'hr.employees.status.' + e.status | translate" [tone]="e.status === 'active' ? 'success' : 'secondary'" />
                  @if (e.onLeaveToday) {
                    <app-status-badge class="ms-1" [label]="'hr.employees.onLeave' | translate" tone="info" />
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="text-center text-body-secondary py-4">{{ 'hr.employees.none' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class EmployeeList {
  protected readonly format = inject(HrFormat);
  protected readonly statuses = EMPLOYEE_STATUSES;
  protected readonly all = signal<EmployeeProfile[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly q = signal('');
  protected readonly department = signal('');
  protected readonly status = signal<EmployeeStatus | ''>('');
  protected readonly departments = computed(() => [...new Set((this.all() ?? []).map((e) => e.department))].sort());
  protected readonly rows = computed(() => {
    const term = this.q().trim().toLowerCase();
    return (this.all() ?? []).filter(
      (e) => (!this.department() || e.department === this.department()) && (!this.status() || e.status === this.status()) && (!term || [e.name, e.email, e.jobTitle].some((v) => v.toLowerCase().includes(term))),
    );
  });

  constructor() {
    inject(HrApiService).employees().subscribe({ next: (r) => this.all.set(r), error: () => this.failed.set(true) });
  }
}
