import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { EmployeeLeavePanel } from './employee-leave-panel';
import { HrApiService } from './hr-api.service';
import { HrFormat } from './hr-format';
import { PayslipList } from './payslip-list';
import { SalaryPanel } from './salary-panel';
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, EmployeeProfile } from './hr.models';

type Tab = 'profile' | 'salary' | 'leave' | 'payslips';

/** One person's HR file: profile, salary, leave and payslips. Owners and HR managers edit; everyone reads their own. */
@Component({
  selector: 'app-employee-detail',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, StatusBadge, FieldError, SalaryPanel, EmployeeLeavePanel, PayslipList],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'hr.employees.loadFailed' | translate }}</div>
    } @else if (employee(); as e) {
      <app-page-header [title]="e.name">
        @if (auth.can('hr.view')) {
          <a class="btn btn-outline-secondary" routerLink="/app/hr/employees"><i class="fa-solid fa-arrow-left me-1" aria-hidden="true"></i>{{ 'hr.employees.back' | translate }}</a>
        }
      </app-page-header>
      <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
        <span class="text-body-secondary" dir="ltr">{{ e.email }}</span>
        <app-status-badge [label]="'hr.employees.status.' + e.status | translate" [tone]="e.status === 'active' ? 'success' : 'secondary'" />
        @if (e.onLeaveToday) {
          <app-status-badge [label]="'hr.employees.onLeave' | translate" tone="info" />
        }
      </div>

      <ul class="nav nav-tabs mb-3" role="tablist">
        @for (t of tabs(); track t) {
          <li class="nav-item" role="presentation">
            <button type="button" role="tab" class="nav-link" [class.active]="tab() === t" [attr.aria-selected]="tab() === t" (click)="tab.set(t)">{{ 'hr.employees.tabs.' + t | translate }}</button>
          </li>
        }
      </ul>

      @switch (tab()) {
        @case ('profile') {
          <form [formGroup]="form" (ngSubmit)="save(e)" novalidate class="card"><div class="card-body">
            <div class="row g-3">
              <div class="col-md-6">
                <label for="emp-title" class="form-label">{{ 'hr.fields.jobTitle' | translate }} *</label>
                <input id="emp-title" class="form-control" formControlName="jobTitle" [class.is-invalid]="form.controls.jobTitle.invalid && form.controls.jobTitle.touched" />
                <app-field-error [control]="form.controls.jobTitle" />
              </div>
              <div class="col-md-6">
                <label for="emp-dept" class="form-label">{{ 'hr.fields.department' | translate }} *</label>
                <input id="emp-dept" class="form-control" formControlName="department" [class.is-invalid]="form.controls.department.invalid && form.controls.department.touched" />
                <app-field-error [control]="form.controls.department" />
              </div>
              <div class="col-md-4">
                <label for="emp-type" class="form-label">{{ 'hr.fields.employmentType' | translate }}</label>
                <select id="emp-type" class="form-select" formControlName="employmentType">
                  @for (t of types; track t) {
                    <option [value]="t">{{ 'hr.employees.types.' + t | translate }}</option>
                  }
                </select>
              </div>
              <div class="col-md-4">
                <label for="emp-hire" class="form-label">{{ 'hr.fields.hireDate' | translate }} *</label>
                <input id="emp-hire" type="date" class="form-control" dir="ltr" formControlName="hireDate" [class.is-invalid]="form.controls.hireDate.invalid && form.controls.hireDate.touched" />
                <app-field-error [control]="form.controls.hireDate" />
              </div>
              <div class="col-md-4">
                <label for="emp-status" class="form-label">{{ 'hr.fields.status' | translate }}</label>
                <select id="emp-status" class="form-select" formControlName="status">
                  @for (s of statuses; track s) {
                    <option [value]="s">{{ 'hr.employees.status.' + s | translate }}</option>
                  }
                </select>
              </div>
              <div class="col-md-6">
                <label for="emp-phone" class="form-label">{{ 'hr.fields.phone' | translate }}</label>
                <input id="emp-phone" class="form-control" dir="ltr" formControlName="phone" />
              </div>
              <div class="col-md-6">
                <label for="emp-manager" class="form-label">{{ 'hr.fields.manager' | translate }}</label>
                @if (canManage()) {
                  <select id="emp-manager" class="form-select" formControlName="managerId">
                    <option value="">—</option>
                    @for (m of managers(); track m.userId) {
                      <option [value]="m.userId">{{ m.name }}</option>
                    }
                  </select>
                } @else {
                  <input id="emp-manager" class="form-control" [value]="e.managerName ?? '—'" disabled />
                }
              </div>
              <div class="col-12">
                <label for="emp-address" class="form-label">{{ 'hr.fields.address' | translate }}</label>
                <input id="emp-address" class="form-control" formControlName="address" />
              </div>
              <div class="col-md-6">
                <label for="emp-ecn" class="form-label">{{ 'hr.fields.emergencyName' | translate }}</label>
                <input id="emp-ecn" class="form-control" formControlName="emergencyContactName" />
              </div>
              <div class="col-md-6">
                <label for="emp-ecp" class="form-label">{{ 'hr.fields.emergencyPhone' | translate }}</label>
                <input id="emp-ecp" class="form-control" dir="ltr" formControlName="emergencyContactPhone" />
              </div>
              @if (e.nationalId !== undefined) {
                <div class="col-md-6">
                  <label for="emp-nid" class="form-label">{{ 'hr.fields.nationalId' | translate }}</label>
                  <input id="emp-nid" class="form-control" dir="ltr" inputmode="numeric" formControlName="nationalId" [class.is-invalid]="form.controls.nationalId.invalid && form.controls.nationalId.touched" />
                  <app-field-error [control]="form.controls.nationalId" />
                  <div class="form-text">{{ 'hr.fields.nationalIdHint' | translate }}</div>
                </div>
              }
              <div class="col-12">
                <label for="emp-notes" class="form-label">{{ 'hr.fields.notes' | translate }}</label>
                <textarea id="emp-notes" class="form-control" rows="2" formControlName="notes"></textarea>
              </div>
            </div>
            @if (serverError(); as msg) {
              <div class="alert alert-danger mt-3" role="alert">{{ msg }}</div>
            }
            @if (saved()) {
              <div class="alert alert-success mt-3" role="status">{{ 'hr.employees.saved' | translate }}</div>
            }
            @if (canManage()) {
              <div class="mt-3"><button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | translate }}</button></div>
            }
          </div></form>
        }
        @case ('salary') {
          <app-salary-panel [userId]="e.userId" />
        }
        @case ('leave') {
          <app-employee-leave-panel [userId]="e.userId" />
        }
        @case ('payslips') {
          <app-payslip-list [userId]="isSelf() ? undefined : e.userId" />
        }
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class EmployeeDetail {
  private readonly api = inject(HrApiService);
  protected readonly auth = inject(AuthService);
  protected readonly format = inject(HrFormat);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly types = EMPLOYMENT_TYPES;
  protected readonly statuses = EMPLOYEE_STATUSES;
  protected readonly employee = signal<EmployeeProfile | null>(null);
  protected readonly managers = signal<EmployeeProfile[]>([]);
  protected readonly failed = signal(false);
  protected readonly tab = signal<Tab>('profile');
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly isSelf = computed(() => this.id === this.auth.user()?.id);
  protected readonly canManage = computed(() => this.auth.can('hr.manage'));
  protected readonly tabs = computed<Tab[]>(() => {
    const t: Tab[] = ['profile'];
    if (this.isSelf() || this.auth.can('payroll.view')) t.push('salary');
    t.push('leave');
    if (this.isSelf() || this.auth.can('payroll.view')) t.push('payslips');
    return t;
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    jobTitle: ['', Validators.required],
    department: ['', Validators.required],
    employmentType: ['full_time' as EmployeeProfile['employmentType']],
    hireDate: ['', Validators.required],
    status: ['active' as EmployeeProfile['status']],
    phone: [''],
    managerId: [''],
    address: [''],
    emergencyContactName: [''],
    emergencyContactPhone: [''],
    nationalId: ['', Validators.pattern(/^\d*$/)],
    notes: [''],
  });

  constructor() {
    this.api.employee(this.id).subscribe({
      next: (e) => {
        this.employee.set(e);
        this.fill(e);
        if (this.canManage()) this.api.employees().subscribe((all) => this.managers.set(all.filter((m) => m.userId !== e.userId && m.status === 'active')));
      },
      error: () => this.failed.set(true),
    });
  }

  private fill(e: EmployeeProfile): void {
    this.form.reset({ ...e, managerId: e.managerId ?? '', nationalId: e.nationalId ?? '' });
    if (!this.canManage()) this.form.disable();
  }

  protected save(e: EmployeeProfile): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.saved.set(false);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    this.api.saveEmployee(e.userId, { ...v, ...(e.nationalId === undefined ? { nationalId: undefined } : {}) }).subscribe({
      next: (u) => {
        this.busy.set(false);
        this.employee.set(u);
        this.fill(u);
        this.saved.set(true);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        for (const [field, message] of Object.entries(fieldErrors(err))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(err));
      },
    });
  }
}
