import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { sum } from '../../core/money/money';
import { FieldError } from '../../shared/components/field-error/field-error';
import { HrApiService } from './hr-api.service';
import { HrFormat } from './hr-format';
import { COMPONENT_KINDS, PayComponent, Salary } from './hr.models';

const AMOUNT = /^\d{1,13}(\.\d{1,2})?$/;

const newRow = (fb: NonNullableFormBuilder, c?: PayComponent) =>
  fb.group({
    name: [c?.name ?? '', Validators.required],
    kind: [c?.kind ?? ('allowance' as PayComponent['kind'])],
    amount: [c?.amount ?? '', [Validators.required, Validators.pattern(AMOUNT)]],
  });

/** Base salary, allowances and deductions of one employee, with the change history. Editing needs payroll.process. */
@Component({
  selector: 'app-salary-panel',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'hr.salary.forbidden' | translate }}</div>
    } @else if (salary(); as s) {
      <div class="alert alert-info small" role="note"><i class="fa-solid fa-circle-info me-1" aria-hidden="true"></i>{{ 'hr.salary.note' | translate }}</div>
      @if (!editing()) {
        <div class="row g-3 mb-3">
          <div class="col-md-4"><div class="card"><div class="card-body"><div class="small text-body-secondary">{{ 'hr.salary.base' | translate }}</div><div class="fs-4 fw-bold" dir="ltr">{{ format.money(s.baseSalary) }}</div></div></div></div>
          <div class="col-md-4"><div class="card"><div class="card-body"><div class="small text-body-secondary">{{ 'hr.salary.allowances' | translate }}</div><div class="fs-4 fw-bold text-success" dir="ltr">{{ format.money(total(s.components, 'allowance')) }}</div></div></div></div>
          <div class="col-md-4"><div class="card"><div class="card-body"><div class="small text-body-secondary">{{ 'hr.salary.deductions' | translate }}</div><div class="fs-4 fw-bold text-danger" dir="ltr">{{ format.money(total(s.components, 'deduction')) }}</div></div></div></div>
        </div>
        @if (s.components.length) {
          <div class="table-responsive mb-3">
            <table class="table table-sm align-middle">
              <caption class="visually-hidden">{{ 'hr.salary.components' | translate }}</caption>
              <thead><tr><th scope="col">{{ 'hr.salary.componentName' | translate }}</th><th scope="col">{{ 'hr.salary.kind' | translate }}</th><th scope="col" class="text-end">{{ 'hr.salary.amount' | translate }}</th></tr></thead>
              <tbody>
                @for (c of s.components; track $index) {
                  <tr><td>{{ c.name }}</td><td>{{ 'hr.salary.kinds.' + c.kind | translate }}</td><td class="text-end" dir="ltr">{{ format.money(c.amount) }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
        <p class="text-body-secondary">{{ 'hr.salary.effective' | translate }}: {{ format.date(s.effectiveFrom) }}</p>
        @if (canEdit()) {
          <button type="button" class="btn btn-primary" (click)="edit(s)"><i class="fa-solid fa-pen me-1" aria-hidden="true"></i>{{ 'common.edit' | translate }}</button>
        }

        <h3 class="h6 mt-4">{{ 'hr.salary.history' | translate }}</h3>
        <div class="table-responsive">
          <table class="table table-sm">
            <caption class="visually-hidden">{{ 'hr.salary.history' | translate }}</caption>
            <thead><tr><th scope="col">{{ 'hr.salary.effective' | translate }}</th><th scope="col" class="text-end">{{ 'hr.salary.base' | translate }}</th><th scope="col" class="text-end">{{ 'hr.salary.allowances' | translate }}</th><th scope="col" class="text-end">{{ 'hr.salary.deductions' | translate }}</th><th scope="col">{{ 'hr.salary.changedBy' | translate }}</th></tr></thead>
            <tbody>
              @for (h of s.history; track h.at) {
                <tr><td>{{ format.date(h.effectiveFrom) }}</td><td class="text-end" dir="ltr">{{ format.money(h.baseSalary) }}</td><td class="text-end" dir="ltr">{{ format.money(h.allowances) }}</td><td class="text-end" dir="ltr">{{ format.money(h.deductions) }}</td><td>{{ h.by }} · {{ format.dateTime(h.at) }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label for="sal-base" class="form-label">{{ 'hr.salary.base' | translate }} *</label>
              <input id="sal-base" class="form-control" dir="ltr" inputmode="decimal" formControlName="baseSalary" [class.is-invalid]="form.controls.baseSalary.invalid && form.controls.baseSalary.touched" />
              <app-field-error [control]="form.controls.baseSalary" />
            </div>
            <div class="col-md-6">
              <label for="sal-eff" class="form-label">{{ 'hr.salary.effective' | translate }} *</label>
              <input id="sal-eff" type="date" class="form-control" dir="ltr" formControlName="effectiveFrom" [class.is-invalid]="form.controls.effectiveFrom.invalid && form.controls.effectiveFrom.touched" />
              <app-field-error [control]="form.controls.effectiveFrom" />
            </div>
          </div>
          <h3 class="h6">{{ 'hr.salary.components' | translate }}</h3>
          <div formArrayName="components">
            @for (row of components.controls; track row; let i = $index) {
              <div class="row g-2 mb-2 align-items-start" [formGroupName]="i">
                <div class="col-12 col-md-5">
                  <input class="form-control" [attr.aria-label]="'hr.salary.componentName' | translate" formControlName="name" [class.is-invalid]="row.controls.name.invalid && row.controls.name.touched" />
                </div>
                <div class="col-6 col-md-3">
                  <select class="form-select" [attr.aria-label]="'hr.salary.kind' | translate" formControlName="kind">
                    @for (k of kinds; track k) {
                      <option [value]="k">{{ 'hr.salary.kinds.' + k | translate }}</option>
                    }
                  </select>
                </div>
                <div class="col-4 col-md-3">
                  <input class="form-control" dir="ltr" inputmode="decimal" [attr.aria-label]="'hr.salary.amount' | translate" formControlName="amount" [class.is-invalid]="row.controls.amount.invalid && row.controls.amount.touched" />
                </div>
                <div class="col-2 col-md-1 text-end">
                  <button type="button" class="btn btn-outline-danger" [attr.aria-label]="'common.delete' | translate" (click)="components.removeAt(i)"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                </div>
              </div>
            }
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm mb-3" (click)="addRow()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'hr.salary.addComponent' | translate }}</button>
          @if (serverError(); as e) {
            <div class="alert alert-danger" role="alert">{{ e }}</div>
          }
          <div class="d-flex gap-2">
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | translate }}</button>
            <button type="button" class="btn btn-outline-secondary" (click)="editing.set(false)">{{ 'common.cancel' | translate }}</button>
          </div>
        </form>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class SalaryPanel {
  readonly userId = input.required<string>();
  private readonly api = inject(HrApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly auth = inject(AuthService);
  protected readonly format = inject(HrFormat);
  protected readonly kinds = COMPONENT_KINDS;
  protected readonly salary = signal<Salary | null>(null);
  protected readonly failed = signal(false);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly components = this.fb.array([] as ReturnType<typeof newRow>[]);
  protected readonly form = this.fb.group({
    baseSalary: ['', [Validators.required, Validators.pattern(AMOUNT)]],
    effectiveFrom: ['', Validators.required],
    components: this.components,
  });

  ngOnInit(): void {
    this.api.salary(this.userId()).subscribe({ next: (s) => this.salary.set(s), error: () => this.failed.set(true) });
  }

  protected canEdit(): boolean {
    return this.auth.can('payroll.process');
  }

  protected total(list: readonly PayComponent[], kind: PayComponent['kind']): string {
    return sum(list.filter((c) => c.kind === kind).map((c) => c.amount));
  }

  protected addRow(): void {
    this.components.push(newRow(this.fb));
  }

  protected edit(s: Salary): void {
    this.components.clear();
    s.components.forEach((c) => this.components.push(newRow(this.fb, c)));
    this.form.patchValue({ baseSalary: s.baseSalary, effectiveFrom: s.effectiveFrom });
    this.serverError.set(null);
    this.editing.set(true);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    this.api.saveSalary(this.userId(), v as never).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.salary.set(s);
        this.editing.set(false);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        const fe = fieldErrors(e);
        for (const [field, message] of Object.entries(fe)) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}

