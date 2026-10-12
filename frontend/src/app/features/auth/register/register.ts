import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ValidationErrorBody } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { AuthLayout } from '../auth-layout/auth-layout';

/** Mirrors the server rule (Laravel `Password::min(12)`); the breached-password check happens server-side only. */
export const MIN_PASSWORD_LENGTH = 12;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const confirmation = group.get('passwordConfirmation');
  if (!confirmation || confirmation.hasError('server')) {
    return null;
  }
  return group.get('password')?.value === confirmation.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, AuthLayout],
  templateUrl: './register.html',
})
export class Register {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly form = this.fb.group(
    {
      officeName: ['', [Validators.required, Validators.maxLength(120)]],
      name: ['', [Validators.required, Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
      passwordConfirmation: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );
  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  /** null while the form is shown; set after a successful registration. */
  protected readonly verificationRequired = signal<boolean | null>(null);
  protected readonly failed = signal(false);

  protected get passwordLength(): number {
    return this.form.controls.password.value.length;
  }

  protected get mismatch(): boolean {
    const confirmation = this.form.controls.passwordConfirmation;
    return this.form.hasError('mismatch') && confirmation.touched && confirmation.value !== '';
  }

  protected submit(): void {
    this.failed.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.auth.register(this.form.getRawValue()).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.verificationRequired.set(res.emailVerificationRequired);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.handleError(error);
      },
    });
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      const body = (error.error ?? {}) as ValidationErrorBody;
      for (const [field, messages] of Object.entries(body.errors ?? {})) {
        const control = this.form.get(field);
        if (control) {
          control.setErrors({ server: messages[0] });
          control.markAsTouched();
        }
      }
      return;
    }
    this.failed.set(true);
  }
}
