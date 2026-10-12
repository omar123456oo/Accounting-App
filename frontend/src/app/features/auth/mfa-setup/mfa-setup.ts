import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ValidationErrorBody } from '../../../core/auth/auth.models';
import { MfaService, MfaSetup } from '../../../core/auth/mfa.service';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { LanguageSwitch } from '../../../shared/components/language-switch/language-switch';

@Component({
  selector: 'app-mfa-setup',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, LanguageSwitch],
  template: `
    <main class="container py-5" style="max-inline-size: 36rem">
      <div class="d-flex align-items-center justify-content-between mb-4">
        <h1 class="h4 mb-0">{{ 'mfa.title' | translate }}</h1>
        <app-language-switch />
      </div>

      @if (confirmed()) {
        <div class="alert alert-success" role="status">{{ 'mfa.done' | translate }}</div>
        <a class="btn btn-primary" routerLink="/app">{{ 'mfa.continue' | translate }}</a>
      } @else if (setup(); as s) {
        <p>{{ 'mfa.instructions' | translate }}</p>
        <dl class="mb-4">
          <dt>{{ 'mfa.secret' | translate }}</dt>
          <dd><code dir="ltr" id="mfa-secret" class="user-select-all">{{ s.secret }}</code></dd>
          <dt>{{ 'mfa.link' | translate }}</dt>
          <dd><a dir="ltr" class="text-break" [href]="s.otpauth_url">{{ s.otpauth_url }}</a></dd>
        </dl>
        <form [formGroup]="form" (ngSubmit)="confirm()" novalidate>
          <div class="mb-3">
            <label for="mfa-otp" class="form-label">{{ 'login.otp' | translate }}</label>
            <input
              id="mfa-otp"
              type="text"
              inputmode="numeric"
              maxlength="6"
              class="form-control"
              formControlName="otp"
              autocomplete="one-time-code"
              required
              [class.is-invalid]="form.controls.otp.invalid && form.controls.otp.touched"
              [attr.aria-invalid]="form.controls.otp.invalid && form.controls.otp.touched"
              aria-describedby="mfa-otp-error"
            />
            <app-field-error [control]="form.controls.otp" id="mfa-otp-error" />
          </div>
          <button type="submit" class="btn btn-primary">{{ 'mfa.confirm' | translate }}</button>
        </form>
      }
    </main>
  `,
})
export class MfaSetupPage implements OnInit {
  private readonly mfa = inject(MfaService);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly form = inject(FormBuilder).nonNullable.group({ otp: ['', [Validators.required]] });
  protected readonly setup = signal<MfaSetup | null>(null);
  protected readonly confirmed = signal(false);

  ngOnInit(): void {
    this.mfa.setup().subscribe({ next: (s) => this.setup.set(s), error: () => undefined });
  }

  protected confirm(): void {
    this.form.controls.otp.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.mfa.confirm(this.form.getRawValue().otp).subscribe({
      next: () => this.confirmed.set(true),
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 422) {
          const message = ((error.error ?? {}) as ValidationErrorBody).errors?.['otp']?.[0];
          this.form.controls.otp.setErrors({ server: message ?? '' });
          this.form.controls.otp.markAsTouched();
          this.cdr.markForCheck();
        }
      },
    });
  }
}
