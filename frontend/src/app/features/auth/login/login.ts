import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ValidationErrorBody } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { LanguageSwitch } from '../../../shared/components/language-switch/language-switch';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, LanguageSwitch],
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    otp: [''],
  });
  protected readonly otpRequired = signal(false);
  protected readonly locked = signal(false);
  protected readonly submitting = signal(false);
  private readonly otpInput = viewChild<ElementRef<HTMLInputElement>>('otpInput');

  protected submit(): void {
    this.locked.set(false);
    this.clearServerErrors();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password, otp } = this.form.getRawValue();
    this.submitting.set(true);
    this.auth.login(email, password, this.otpRequired() ? otp : undefined).subscribe({
      next: (user) => void this.router.navigate([user.type === 'staff' ? '/app' : '/portal']),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.handleError(error);
      },
    });
  }

  private clearServerErrors(): void {
    for (const control of Object.values(this.form.controls)) {
      if (control.hasError('server')) {
        control.updateValueAndValidity();
      }
    }
  }

  private handleError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      return;
    }
    if (error.status === 423) {
      this.locked.set(true);
    } else if (error.status === 422) {
      this.mapFieldErrors((error.error ?? {}) as ValidationErrorBody);
    }
  }

  /** Copies the API's per-field messages onto the matching form controls. */
  private mapFieldErrors(body: ValidationErrorBody): void {
    for (const [field, messages] of Object.entries(body.errors ?? {})) {
      const control = this.form.get(field);
      if (!control) {
        continue;
      }
      if (field === 'otp' && !this.otpRequired()) {
        this.otpRequired.set(true);
        control.setValidators([Validators.required]);
        setTimeout(() => this.otpInput()?.nativeElement.focus());
      }
      control.setErrors({ server: messages[0] });
      control.markAsTouched();
    }
  }
}
