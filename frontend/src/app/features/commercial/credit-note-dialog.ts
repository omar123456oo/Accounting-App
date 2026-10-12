import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { cmp, isPositive, isValidAmount, toPlain } from '../../core/money/money';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { LedgerContext } from '../accounting/ledger-context';
import { BusinessClock } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { Bill, Invoice, Side } from './commercial.models';
import { SettlementApiService } from './settlement-api.service';

/**
 * A credit note (customer) or supplier credit against one open document. It reduces the open balance and posts
 * a reversing journal in proportion to the document's lines; the document itself is never edited.
 */
@Component({
  selector: 'app-credit-note-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Modal, FieldError],
  template: `
    <app-modal [title]="'commercial.credit.' + side() + '.title' | translate" (closed)="cancelled.emit()">
      <p class="small text-body-secondary">{{ 'commercial.credit.intro' | translate: { reference: doc().reference, balance: format.amount(doc().balance) } }}</p>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="row g-3">
          <div class="col-12 col-md-6">
            <label for="cn-amount" class="form-label">{{ 'commercial.credit.amount' | translate }} *</label>
            <input id="cn-amount" class="form-control" dir="ltr" inputmode="decimal" formControlName="amount" [class.is-invalid]="form.controls.amount.invalid && form.controls.amount.touched" />
            <app-field-error [control]="form.controls.amount" />
          </div>
          <div class="col-12 col-md-6">
            <label for="cn-date" class="form-label">{{ 'commercial.credit.date' | translate }} *</label>
            <input id="cn-date" type="date" class="form-control" formControlName="date" [class.is-invalid]="form.controls.date.invalid && form.controls.date.touched" />
            <app-field-error [control]="form.controls.date" />
          </div>
          <div class="col-12">
            <label for="cn-reason" class="form-label">{{ 'commercial.credit.reason' | translate }} *</label>
            <textarea id="cn-reason" class="form-control" rows="2" formControlName="reason" [class.is-invalid]="form.controls.reason.invalid && form.controls.reason.touched"></textarea>
            <app-field-error [control]="form.controls.reason" />
          </div>
        </div>
        @if (serverError(); as e) {
          <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
        }
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="working()">{{ 'commercial.credit.create' | translate }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class CreditNoteDialog implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(SettlementApiService);
  private readonly clock = inject(BusinessClock);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;

  readonly side = input.required<Side>();
  readonly doc = input.required<Invoice | Bill>();
  readonly done = output<Invoice | Bill>();
  readonly cancelled = output<void>();

  protected readonly working = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly form = this.fb.group({
    amount: ['', [Validators.required, (c: { value: string }) => (isValidAmount(String(c.value).trim()) && isPositive(String(c.value).trim()) ? null : { pattern: true })]],
    date: ['', Validators.required],
    reason: ['', Validators.required],
  });

  ngOnInit(): void {
    this.form.patchValue({ amount: toPlain(this.doc().balance) });
    this.clock.today(this.ledgerId).subscribe((t) => this.form.patchValue({ date: t }));
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || this.working()) return;
    if (cmp(v.amount.trim(), this.doc().balance) > 0) {
      this.form.controls.amount.setErrors({ server: this.translate.instant('commercial.credit.exceeds', { balance: this.format.amount(this.doc().balance) }) });
      return;
    }
    this.working.set(true);
    this.serverError.set(null);
    this.api.createCreditNote(this.ledgerId, this.side(), { docId: this.doc().id, date: v.date, reason: v.reason.trim(), amount: v.amount.trim() }).subscribe({
      next: (r) => {
        this.working.set(false);
        this.done.emit(r.document);
      },
      error: (e: unknown) => {
        this.working.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}
