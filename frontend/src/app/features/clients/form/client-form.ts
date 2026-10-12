import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ValidationErrorBody } from '../../../core/auth/auth.models';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { AssignableUser, Client, ClientInput, LEGAL_FORMS, LegalForm } from '../client.models';
import { ClientFormat } from '../client-format';
import { ClientsApiService } from '../clients-api.service';

/** Non-empty values must be digits only. Not legal validation: Egyptian tax ID rules need specialist confirmation. */
export function digitsOnly(control: AbstractControl): ValidationErrors | null {
  const v = String(control.value ?? '').trim();
  return v === '' || /^\d+$/.test(v) ? null : { digits: true };
}

@Component({
  selector: 'app-client-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, PageHeader, ConfirmDialog],
  templateUrl: './client-form.html',
})
export class ClientForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(ClientsApiService);
  private readonly router = inject(Router);
  protected readonly format = inject(ClientFormat);
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');

  protected readonly legalForms = LEGAL_FORMS;
  protected readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  protected readonly editing = this.id !== null;
  protected readonly loading = signal(this.editing);
  protected readonly notFound = signal(false);
  protected readonly submitting = signal(false);
  protected readonly leaving = signal(false);
  protected readonly assignable = signal<AssignableUser[]>([]);
  private resolveLeave: ((ok: boolean) => void) | null = null;

  protected readonly form = this.fb.group({
    legalName: ['', Validators.required],
    tradeName: [''],
    legalForm: ['company' as LegalForm, Validators.required],
    commercialRegistrationNo: ['', digitsOnly],
    taxRegistrationNo: ['', digitsOnly],
    address: ['', Validators.required],
    industry: [''],
    fiscalYearStartMonth: [1, Validators.required],
    vatRegistered: [false],
    taxType: [''],
    assignedAccountantIds: [[] as string[]],
  });

  constructor() {
    this.api.assignableUsers().subscribe({ next: (users) => this.assignable.set(users), error: () => this.assignable.set([]) });
    if (this.id) {
      this.api.get(this.id).subscribe({
        next: (client) => {
          this.fill(client);
          this.loading.set(false);
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
    }
  }

  private fill(c: Client): void {
    this.form.reset({
      legalName: c.legalName,
      tradeName: c.tradeName ?? '',
      legalForm: c.legalForm,
      commercialRegistrationNo: c.commercialRegistrationNo ?? '',
      taxRegistrationNo: c.taxRegistrationNo ?? '',
      address: c.address,
      industry: c.industry ?? '',
      fiscalYearStartMonth: c.fiscalYearStartMonth,
      vatRegistered: c.taxProfile?.vatRegistered ?? false,
      taxType: c.taxProfile?.taxType ?? '',
      assignedAccountantIds: c.assignedAccountantIds,
    });
  }

  protected toggleAssignee(id: string, checked: boolean): void {
    const control = this.form.controls.assignedAccountantIds;
    control.setValue(checked ? [...control.value, id] : control.value.filter((x) => x !== id));
    control.markAsDirty();
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const input: ClientInput = {
      legalName: v.legalName.trim(),
      tradeName: v.tradeName.trim(),
      legalForm: v.legalForm,
      commercialRegistrationNo: v.commercialRegistrationNo.trim(),
      taxRegistrationNo: v.taxRegistrationNo.trim(),
      address: v.address.trim(),
      industry: v.industry.trim(),
      fiscalYearStartMonth: Number(v.fiscalYearStartMonth),
      taxProfile: { vatRegistered: v.vatRegistered, taxType: v.taxType.trim() },
      assignedAccountantIds: v.assignedAccountantIds,
    };
    this.submitting.set(true);
    const request = this.id ? this.api.update(this.id, input) : this.api.create(input);
    request.subscribe({
      next: (client) => {
        this.form.markAsPristine();
        void this.router.navigate(['/app/clients', client.id]);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.mapErrors(error);
      },
    });
  }

  /** Copies the API's per-field 422 messages onto the matching controls. */
  private mapErrors(error: unknown): void {
    if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
      return;
    }
    for (const [field, messages] of Object.entries((error.error as ValidationErrorBody).errors ?? {})) {
      const control = this.form.get(field);
      control?.setErrors({ server: messages[0] });
      control?.markAsTouched();
    }
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.form.dirty) {
      return true;
    }
    this.leaving.set(true);
    return new Promise<boolean>((resolve) => (this.resolveLeave = resolve));
  }

  protected answerLeave(ok: boolean): void {
    this.leaving.set(false);
    this.resolveLeave?.(ok);
    this.resolveLeave = null;
  }
}
