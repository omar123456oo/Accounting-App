import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { HrApiService } from './hr-api.service';
import { HrFormat } from './hr-format';
import { LeaveApplication, LeaveType } from './hr.models';

/** Request leave. `userId` applies on someone else's behalf (HR managers only; the server checks). */
@Component({
  selector: 'app-leave-apply-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Modal, FieldError],
  template: `
    <app-modal [title]="'hr.leave.apply' | translate" (closed)="cancelled.emit()">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="row g-3">
          <div class="col-12">
            <label for="lv-type" class="form-label">{{ 'hr.leave.type' | translate }} *</label>
            <select id="lv-type" class="form-select" formControlName="typeId" [class.is-invalid]="form.controls.typeId.invalid && form.controls.typeId.touched">
              <option value="">—</option>
              @for (t of activeTypes(); track t.id) {
                <option [value]="t.id">{{ format.name(t) }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.typeId" />
          </div>
          <div class="col-6">
            <label for="lv-from" class="form-label">{{ 'hr.leave.from' | translate }} *</label>
            <input id="lv-from" type="date" class="form-control" dir="ltr" formControlName="from" [class.is-invalid]="form.controls.from.invalid && form.controls.from.touched" />
            <app-field-error [control]="form.controls.from" />
          </div>
          <div class="col-6">
            <label for="lv-to" class="form-label">{{ 'hr.leave.to' | translate }} *</label>
            <input id="lv-to" type="date" class="form-control" dir="ltr" formControlName="to" [class.is-invalid]="form.controls.to.invalid && form.controls.to.touched" />
            <app-field-error [control]="form.controls.to" />
          </div>
          <div class="col-12">
            <label for="lv-reason" class="form-label">{{ 'hr.leave.reason' | translate }}</label>
            <textarea id="lv-reason" class="form-control" rows="2" formControlName="reason"></textarea>
          </div>
        </div>
        @if (serverError(); as e) {
          <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
        }
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'hr.leave.submit' | translate }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class LeaveApplyDialog {
  readonly types = input.required<readonly LeaveType[]>();
  readonly userId = input<string>();
  readonly done = output<LeaveApplication>();
  readonly cancelled = output<void>();

  private readonly api = inject(HrApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(HrFormat);
  protected readonly busy = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    typeId: ['', Validators.required],
    from: ['', Validators.required],
    to: ['', Validators.required],
    reason: [''],
  });

  protected activeTypes(): readonly LeaveType[] {
    return this.types().filter((t) => t.active);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.serverError.set(null);
    const uid = this.userId();
    this.api.apply({ ...this.form.getRawValue(), ...(uid ? { userId: uid } : {}) }).subscribe({
      next: (l) => this.done.emit(l),
      error: (e: unknown) => {
        this.busy.set(false);
        // Show every server message somewhere: errors for fields this form does not have (for example the
        // person has no HR file yet), and failures with no message at all, must never leave the dialog silent.
        const unmapped: string[] = [];
        for (const [field, message] of Object.entries(fieldErrors(e))) {
          const control = this.form.get(field);
          if (control) {
            control.setErrors({ server: message });
            control.markAsTouched();
          } else {
            unmapped.push(message);
          }
        }
        this.serverError.set(unmapped.length ? unmapped.join(' ') : Object.keys(fieldErrors(e)).length ? null : (apiErrorMessage(e) ?? this.translate.instant('errors.generic')));
      },
    });
  }
}
