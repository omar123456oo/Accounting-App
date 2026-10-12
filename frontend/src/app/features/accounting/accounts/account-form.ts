import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { Modal } from '../../../shared/components/modal/modal';
import { ACCOUNT_CATEGORIES, Account, AccountCategory, NormalBalance } from '../accounting.models';
import { AccountingFormat } from '../accounting-format';
import { LedgerApiService } from '../ledger-api.service';

const NORMAL: Record<AccountCategory, NormalBalance> = { asset: 'debit', expense: 'debit', liability: 'credit', equity: 'credit', revenue: 'credit' };

/** Create or edit one account. The server refuses category, deactivation and un-posting changes once posted lines exist. */
@Component({
  selector: 'app-account-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, Modal],
  template: `
    <app-modal [title]="(account() ? 'accounting.accounts.edit' : 'accounting.accounts.new') | translate" width="40rem" (closed)="cancelled.emit()">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="row g-3">
          <div class="col-12 col-md-4">
            <label for="acc-code" class="form-label">{{ 'accounting.accounts.fields.code' | translate }} *</label>
            <input id="acc-code" class="form-control" formControlName="code" dir="ltr" [class.is-invalid]="form.controls.code.invalid && form.controls.code.touched" />
            <app-field-error [control]="form.controls.code" />
          </div>
          <div class="col-12 col-md-4">
            <label for="acc-category" class="form-label">{{ 'accounting.accounts.fields.category' | translate }} *</label>
            <select id="acc-category" class="form-select" formControlName="category" [attr.aria-describedby]="locked() ? 'acc-category-hint' : null">
              @for (c of categories; track c) {
                <option [value]="c">{{ 'accounting.category.' + c | translate }}</option>
              }
            </select>
            @if (locked()) {
              <div id="acc-category-hint" class="form-text">{{ 'accounting.accounts.hasPostingsHint' | translate }}</div>
            }
          </div>
          <div class="col-12 col-md-4">
            <label for="acc-normal" class="form-label">{{ 'accounting.accounts.fields.normalBalance' | translate }}</label>
            <select id="acc-normal" class="form-select" formControlName="normalBalance">
              <option value="debit">{{ 'accounting.normal.debit' | translate }}</option>
              <option value="credit">{{ 'accounting.normal.credit' | translate }}</option>
            </select>
          </div>
          <div class="col-12 col-md-6">
            <label for="acc-name-ar" class="form-label">{{ 'accounting.accounts.fields.nameAr' | translate }} *</label>
            <input id="acc-name-ar" class="form-control" dir="rtl" formControlName="nameAr" [class.is-invalid]="form.controls.nameAr.invalid && form.controls.nameAr.touched" />
            <app-field-error [control]="form.controls.nameAr" />
          </div>
          <div class="col-12 col-md-6">
            <label for="acc-name-en" class="form-label">{{ 'accounting.accounts.fields.nameEn' | translate }} *</label>
            <input id="acc-name-en" class="form-control" dir="ltr" formControlName="nameEn" [class.is-invalid]="form.controls.nameEn.invalid && form.controls.nameEn.touched" />
            <app-field-error [control]="form.controls.nameEn" />
          </div>
          <div class="col-12">
            <label for="acc-parent" class="form-label">{{ 'accounting.accounts.fields.parent' | translate }}</label>
            <select id="acc-parent" class="form-select" formControlName="parentId">
              <option value="">{{ 'accounting.accounts.noParent' | translate }}</option>
              @for (p of parents(); track p.id) {
                <option [value]="p.id">{{ p.code }} - {{ format.name(p) }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.parentId" />
          </div>
          <div class="col-12 col-md-6">
            <div class="form-check">
              <input id="acc-postable" type="checkbox" class="form-check-input" formControlName="isPostable" />
              <label for="acc-postable" class="form-check-label">{{ 'accounting.accounts.fields.postable' | translate }}</label>
            </div>
            <div class="form-text">{{ 'accounting.accounts.postableHint' | translate }}</div>
          </div>
          @if (account()) {
            <div class="col-12 col-md-6">
              <div class="form-check">
                <input id="acc-active" type="checkbox" class="form-check-input" formControlName="isActive" />
                <label for="acc-active" class="form-check-label">{{ 'accounting.accounts.fields.active' | translate }}</label>
              </div>
            </div>
          }
        </div>
        @if (serverError(); as message) {
          <div class="alert alert-danger mt-3 mb-0" role="alert">{{ message }}</div>
        }
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="submitting()">{{ 'common.save' | translate }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class AccountForm implements OnInit {
  readonly ledgerId = input.required<string>();
  readonly accounts = input.required<readonly Account[]>();
  readonly account = input<Account | null>(null);
  readonly saved = output<Account>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(LedgerApiService);
  protected readonly format = inject(AccountingFormat);
  protected readonly categories = ACCOUNT_CATEGORIES;
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    code: ['', Validators.required],
    nameAr: ['', Validators.required],
    nameEn: ['', Validators.required],
    category: ['asset' as AccountCategory],
    normalBalance: ['debit' as NormalBalance],
    parentId: [''],
    isPostable: [true],
    isActive: [true],
  });
  private readonly category = toSignal(this.form.controls.category.valueChanges, { initialValue: this.form.controls.category.value });
  protected readonly locked = computed(() => this.account()?.hasPostings ?? false);
  protected readonly parents = computed(() => this.accounts().filter((a) => !a.isPostable && a.category === this.category() && a.id !== this.account()?.id));

  ngOnInit(): void {
    const a = this.account();
    if (a) {
      this.form.patchValue({ code: a.code, nameAr: a.nameAr, nameEn: a.nameEn, category: a.category, normalBalance: a.normalBalance, parentId: a.parentId ?? '', isPostable: a.isPostable, isActive: a.isActive });
      if (a.hasPostings) this.form.controls.category.disable();
    }
    this.form.controls.category.valueChanges.subscribe((c) => {
      this.form.patchValue({ normalBalance: NORMAL[c], parentId: '' });
    });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const input = { code: v.code.trim(), nameAr: v.nameAr.trim(), nameEn: v.nameEn.trim(), category: v.category, normalBalance: v.normalBalance, parentId: v.parentId, isPostable: v.isPostable, ...(this.account() ? { isActive: v.isActive } : {}) };
    this.submitting.set(true);
    this.serverError.set(null);
    const existing = this.account();
    const request = existing ? this.api.updateAccount(this.ledgerId(), existing.id, input) : this.api.createAccount(this.ledgerId(), input);
    request.subscribe({
      next: (a) => this.saved.emit(a),
      error: (e: unknown) => {
        this.submitting.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}
