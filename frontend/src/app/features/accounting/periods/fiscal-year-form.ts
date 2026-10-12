import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { Modal } from '../../../shared/components/modal/modal';
import { LedgerApiService } from '../ledger-api.service';

/** A fiscal year may start in any month; the server generates its twelve monthly periods. */
@Component({
  selector: 'app-fiscal-year-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, Modal],
  template: `
    <app-modal [title]="'accounting.periods.newYear' | translate" (closed)="cancelled.emit()">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="mb-3">
          <label for="fy-name" class="form-label">{{ 'accounting.periods.fields.name' | translate }} *</label>
          <input id="fy-name" class="form-control" formControlName="name" [class.is-invalid]="form.controls.name.invalid && form.controls.name.touched" />
          <app-field-error [control]="form.controls.name" />
        </div>
        <div class="mb-3">
          <label for="fy-start" class="form-label">{{ 'accounting.periods.fields.startDate' | translate }} *</label>
          <input id="fy-start" type="date" class="form-control" formControlName="startDate" aria-describedby="fy-start-hint" [class.is-invalid]="form.controls.startDate.invalid && form.controls.startDate.touched" />
          <div id="fy-start-hint" class="form-text">{{ 'accounting.periods.startHint' | translate }}</div>
          <app-field-error [control]="form.controls.startDate" />
        </div>
        @if (serverError(); as message) {
          <div class="alert alert-danger" role="alert">{{ message }}</div>
        }
        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="submitting()">{{ 'common.save' | translate }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class FiscalYearForm {
  readonly ledgerId = input.required<string>();
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  private readonly api = inject(LedgerApiService);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({ name: ['', Validators.required], startDate: ['', Validators.required] });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    this.api.createFiscalYear(this.ledgerId(), { name: v.name.trim(), startDate: v.startDate }).subscribe({
      next: () => this.saved.emit(),
      error: (e: unknown) => {
        this.submitting.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}
