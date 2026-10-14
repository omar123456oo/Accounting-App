import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { HrApiService } from './hr-api.service';
import { HrFormat, WEEKDAYS } from './hr-format';
import { HrSettings, LeaveType } from './hr.models';

/** Office policy: leave types and yearly entitlements, the weekend, public holidays and the unpaid-leave rule. HR managers only. */
@Component({
  selector: 'app-hr-settings-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Modal, FieldError],
  template: `
    <app-page-header [title]="'hr.settings.title' | translate" />
    <div class="alert alert-warning small" role="note"><i class="fa-solid fa-triangle-exclamation me-1" aria-hidden="true"></i>{{ 'hr.settings.placeholder' | translate }}</div>

    <section class="mb-4" aria-labelledby="types-title">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="h5 mb-0" id="types-title">{{ 'hr.settings.leaveTypes' | translate }}</h2>
        <button type="button" class="btn btn-primary btn-sm" (click)="openType(null)"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'hr.settings.newType' | translate }}</button>
      </div>
      @if (types(); as list) {
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'hr.settings.leaveTypes' | translate }}</caption>
            <thead><tr><th scope="col">{{ 'hr.settings.name' | translate }}</th><th scope="col" class="text-end">{{ 'hr.settings.entitlement' | translate }}</th><th scope="col">{{ 'hr.settings.paid' | translate }}</th><th scope="col">{{ 'hr.fields.status' | translate }}</th><th scope="col"></th></tr></thead>
            <tbody>
              @for (t of list; track t.id) {
                <tr>
                  <td>{{ format.name(t) }}</td>
                  <td class="text-end">{{ t.entitlementDays ?? ('hr.leave.unlimited' | translate) }}</td>
                  <td>{{ (t.paid ? 'common.yes' : 'common.no') | translate }}</td>
                  <td>{{ (t.active ? 'hr.settings.active' : 'hr.settings.inactive') | translate }}</td>
                  <td class="text-end"><button type="button" class="btn btn-outline-secondary btn-sm" (click)="openType(t)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ format.name(t) }}</span></button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <section aria-labelledby="policy-title">
      <h2 class="h5" id="policy-title">{{ 'hr.settings.policy' | translate }}</h2>
      @if (settings()) {
        <form [formGroup]="policy" (ngSubmit)="savePolicy()" novalidate class="card"><div class="card-body">
          <fieldset class="mb-3">
            <legend class="form-label">{{ 'hr.settings.weekend' | translate }}</legend>
            @for (d of weekdays; track d) {
              <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" [id]="'wk-' + d" [checked]="weekend().has(d)" (change)="toggleDay(d)" />
                <label class="form-check-label" [for]="'wk-' + d">{{ format.weekday(d) }}</label>
              </div>
            }
          </fieldset>
          <div class="mb-3">
            <label for="holidays" class="form-label">{{ 'hr.settings.holidays' | translate }}</label>
            <textarea id="holidays" class="form-control" dir="ltr" rows="3" formControlName="holidays" placeholder="2026-10-06"></textarea>
            <div class="form-text">{{ 'hr.settings.holidaysHint' | translate }}</div>
          </div>
          <div class="mb-3" style="max-inline-size: 16rem">
            <label for="divisor" class="form-label">{{ 'hr.settings.divisor' | translate }}</label>
            <input id="divisor" type="number" min="20" max="31" class="form-control" dir="ltr" formControlName="unpaidLeaveDivisor" [class.is-invalid]="policy.controls.unpaidLeaveDivisor.invalid && policy.controls.unpaidLeaveDivisor.touched" />
            <app-field-error [control]="policy.controls.unpaidLeaveDivisor" />
            <div class="form-text">{{ 'hr.settings.divisorHint' | translate }}</div>
          </div>
          @if (policyError(); as e) {
            <div class="alert alert-danger" role="alert">{{ e }}</div>
          }
          @if (policySaved()) {
            <div class="alert alert-success" role="status">{{ 'hr.settings.saved' | translate }}</div>
          }
          <button type="submit" class="btn btn-primary">{{ 'common.save' | translate }}</button>
        </div></form>
      }
    </section>

    @if (editing() !== undefined) {
      <app-modal [title]="(editing() ? 'common.edit' : 'hr.settings.newType') | translate" (closed)="editing.set(undefined)">
        <form [formGroup]="typeForm" (ngSubmit)="saveType()" novalidate>
          <div class="row g-3">
            <div class="col-md-6">
              <label for="lt-ar" class="form-label">{{ 'hr.settings.nameAr' | translate }} *</label>
              <input id="lt-ar" class="form-control" dir="rtl" formControlName="nameAr" [class.is-invalid]="typeForm.controls.nameAr.invalid && typeForm.controls.nameAr.touched" />
              <app-field-error [control]="typeForm.controls.nameAr" />
            </div>
            <div class="col-md-6">
              <label for="lt-en" class="form-label">{{ 'hr.settings.nameEn' | translate }} *</label>
              <input id="lt-en" class="form-control" dir="ltr" formControlName="nameEn" [class.is-invalid]="typeForm.controls.nameEn.invalid && typeForm.controls.nameEn.touched" />
              <app-field-error [control]="typeForm.controls.nameEn" />
            </div>
            <div class="col-12">
              <label for="lt-days" class="form-label">{{ 'hr.settings.entitlement' | translate }}</label>
              <input id="lt-days" type="number" min="0" max="366" class="form-control" dir="ltr" formControlName="entitlementDays" />
              <div class="form-text">{{ 'hr.settings.entitlementHint' | translate }}</div>
            </div>
            <div class="col-6 form-check ms-2"><input id="lt-paid" type="checkbox" class="form-check-input" formControlName="paid" /><label for="lt-paid" class="form-check-label">{{ 'hr.settings.paid' | translate }}</label></div>
            <div class="col-5 form-check"><input id="lt-active" type="checkbox" class="form-check-input" formControlName="active" /><label for="lt-active" class="form-check-label">{{ 'hr.settings.active' | translate }}</label></div>
          </div>
          @if (typeError(); as e) {
            <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
          }
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="editing.set(undefined)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class HrSettingsPage {
  private readonly api = inject(HrApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly format = inject(HrFormat);
  protected readonly weekdays = WEEKDAYS;

  protected readonly types = signal<LeaveType[] | null>(null);
  protected readonly settings = signal<HrSettings | null>(null);
  protected readonly weekend = signal<ReadonlySet<number>>(new Set());
  protected readonly editing = signal<LeaveType | null | undefined>(undefined);
  protected readonly typeError = signal<string | null>(null);
  protected readonly policyError = signal<string | null>(null);
  protected readonly policySaved = signal(false);

  protected readonly policy = this.fb.group({
    holidays: [''],
    unpaidLeaveDivisor: [30, [Validators.required, Validators.min(20), Validators.max(31)]],
  });
  protected readonly typeForm = this.fb.group({
    nameAr: ['', Validators.required],
    nameEn: ['', Validators.required],
    entitlementDays: [null as number | null],
    paid: [true],
    active: [true],
  });

  constructor() {
    this.api.leaveTypes().subscribe((t) => this.types.set(t));
    this.api.settings().subscribe((s) => {
      this.settings.set(s);
      this.weekend.set(new Set(s.weekendDays));
      this.policy.reset({ holidays: s.holidays.join('\n'), unpaidLeaveDivisor: s.unpaidLeaveDivisor });
    });
  }

  protected toggleDay(d: number): void {
    const next = new Set(this.weekend());
    if (!next.delete(d)) next.add(d);
    this.weekend.set(next);
  }

  protected savePolicy(): void {
    this.policy.markAllAsTouched();
    if (this.policy.invalid) return;
    this.policySaved.set(false);
    this.policyError.set(null);
    const v = this.policy.getRawValue();
    const holidays = v.holidays.split(/[\s,;]+/).filter(Boolean);
    this.api.saveSettings({ weekendDays: [...this.weekend()], holidays, unpaidLeaveDivisor: Number(v.unpaidLeaveDivisor) }).subscribe({
      next: (s) => {
        this.settings.set(s);
        this.policy.reset({ holidays: s.holidays.join('\n'), unpaidLeaveDivisor: s.unpaidLeaveDivisor });
        this.policySaved.set(true);
      },
      error: (e: unknown) => this.policyError.set(apiErrorMessage(e) ?? 'Error'),
    });
  }

  protected openType(t: LeaveType | null): void {
    this.typeError.set(null);
    this.typeForm.reset(t ? { nameAr: t.nameAr, nameEn: t.nameEn, entitlementDays: t.entitlementDays, paid: t.paid, active: t.active } : { nameAr: '', nameEn: '', entitlementDays: 0, paid: true, active: true });
    this.editing.set(t);
  }

  protected saveType(): void {
    this.typeForm.markAllAsTouched();
    if (this.typeForm.invalid) return;
    const v = this.typeForm.getRawValue();
    const input = { ...v, entitlementDays: v.entitlementDays === null || (v.entitlementDays as unknown) === '' ? null : Number(v.entitlementDays) };
    this.api.saveLeaveType(input, this.editing()?.id).subscribe({
      next: () => {
        this.editing.set(undefined);
        this.api.leaveTypes().subscribe((t) => this.types.set(t));
      },
      error: (e: unknown) => this.typeError.set(apiErrorMessage(e) ?? 'Error'),
    });
  }
}
