import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { isPositive, isValidAmount, toPlain } from '../../core/money/money';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../shared/components/field-error/field-error';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Account } from '../accounting/accounting.models';
import { LedgerApiService } from '../accounting/ledger-api.service';
import { LedgerContext } from '../accounting/ledger-context';
import { OpenDoc, summarize } from './allocation';
import { AllocationTable } from './allocation-table';
import { BusinessClock, CommercialApiService } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { DocBase, Party, Side } from './commercial.models';
import { OpenDocuments } from './open-documents';
import { SettlementApiService } from './settlement-api.service';

/**
 * Records a customer receipt or a supplier payment and allocates it across one or many open documents. The
 * allocation table keeps live totals; an unallocated part becomes a customer credit or a supplier prepayment.
 * The server repeats every check, so over-allocation is refused with 422 even if this screen is bypassed.
 */
@Component({
  selector: 'app-payment-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, FieldError, AllocationTable, ConfirmDialog],
  template: `
    <app-page-header [title]="'commercial.payments.' + side + '.new' | translate" />
    @if (loading()) {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    } @else if (!ready()) {
      <div class="alert alert-warning" role="alert">{{ 'commercial.payments.noAccounts' | translate }}</div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate [attr.aria-label]="'commercial.payments.' + side + '.new' | translate">
        <div class="row g-3 mb-3">
          <div class="col-12 col-md-4">
            <label for="pay-party" class="form-label">{{ 'commercial.parties.' + side + '.one' | translate }} *</label>
            <select id="pay-party" class="form-select" formControlName="partyId" [class.is-invalid]="form.controls.partyId.invalid && form.controls.partyId.touched" (change)="partyChosen($any($event.target).value)">
              <option value="">{{ 'commercial.lines.choose' | translate }}</option>
              @for (p of parties(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.partyId" />
          </div>
          <div class="col-6 col-md-2">
            <label for="pay-date" class="form-label">{{ 'commercial.payments.date' | translate }} *</label>
            <input id="pay-date" type="date" class="form-control" formControlName="date" [class.is-invalid]="form.controls.date.invalid && form.controls.date.touched" />
            <app-field-error [control]="form.controls.date" />
          </div>
          <div class="col-6 col-md-3">
            <label for="pay-account" class="form-label">{{ 'commercial.payments.account' | translate }} *</label>
            <select id="pay-account" class="form-select" formControlName="accountId" [class.is-invalid]="form.controls.accountId.invalid && form.controls.accountId.touched">
              <option value="">{{ 'commercial.lines.choose' | translate }}</option>
              @for (a of accounts(); track a.id) {
                <option [value]="a.id">{{ a.code }} - {{ format.base.name(a) }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.accountId" />
          </div>
          <div class="col-6 col-md-3">
            <label for="pay-amount" class="form-label">{{ 'commercial.payments.amount' | translate }} *</label>
            <input id="pay-amount" class="form-control" dir="ltr" inputmode="decimal" formControlName="amount" [class.is-invalid]="form.controls.amount.invalid && form.controls.amount.touched" />
            <app-field-error [control]="form.controls.amount" />
          </div>
          <div class="col-12 col-md-6">
            <label for="pay-reference" class="form-label">{{ 'commercial.payments.reference' | translate }}</label>
            <input id="pay-reference" class="form-control" formControlName="reference" />
          </div>
        </div>

        <h2 class="h5">{{ 'commercial.allocation.title' | translate }}</h2>
        <app-allocation-table [docs]="docs()" [values]="values()" [capacity]="amount()" (valuesChange)="setValues($event)" />
        @if (summary().valid && isPositive(summary().unallocated) && isPositive(amount())) {
          <p id="unapplied-note" class="mt-2 fw-semibold">{{ 'commercial.allocation.becomes.' + side | translate: { amount: format.amount(summary().unallocated) } }}</p>
        }
        @if (serverError(); as e) {
          <div class="alert alert-danger" role="alert">{{ e }}</div>
        }
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button type="submit" class="btn btn-primary" [disabled]="working() || !canSubmit()">{{ 'commercial.payments.record' | translate }}</button>
          <a class="btn btn-outline-secondary" [routerLink]="listLink">{{ 'common.cancel' | translate }}</a>
        </div>
      </form>
    }
    @if (leaving()) {
      <app-confirm-dialog [title]="'clients.unsaved.title' | translate" [message]="'clients.unsaved.message' | translate" [confirmLabel]="'clients.unsaved.leave' | translate" [danger]="true" (confirmed)="answerLeave(true)" (cancelled)="answerLeave(false)" />
    }
  `,
})
export class PaymentForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly commercial = inject(CommercialApiService);
  private readonly settlement = inject(SettlementApiService);
  private readonly openDocuments = inject(OpenDocuments);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly format = inject(CommercialFormat);
  protected readonly isPositive = isPositive;
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly side = this.route.snapshot.data['side'] as Side;
  protected readonly listLink = this.side === 'ar' ? '/app/invoicing/payments' : '/app/payables/payments';

  protected readonly parties = signal<Party[]>([]);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly openDocs = signal<DocBase[]>([]);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly loading = signal(true);
  protected readonly ready = signal(true);
  protected readonly working = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly leaving = signal(false);
  private resolveLeave: ((ok: boolean) => void) | null = null;
  private done = false;

  protected readonly form = this.fb.group({
    partyId: ['', Validators.required],
    date: ['', Validators.required],
    accountId: ['', Validators.required],
    amount: ['', [Validators.required, (c: { value: string }) => (isValidAmount(String(c.value).trim()) && isPositive(String(c.value).trim()) ? null : { pattern: true })]],
    reference: [''],
  });
  private readonly amountText = signal('');
  protected readonly amount = computed(() => (isValidAmount(this.amountText().trim()) ? this.amountText().trim() : '0'));
  protected readonly docs = computed<OpenDoc[]>(() => this.openDocs().map((d) => ({ id: d.id, reference: d.reference, dueDate: d.dueDate, balance: d.balance })));
  protected readonly summary = computed(() => summarize(this.docs(), this.values(), this.amount()));
  protected readonly canSubmit = computed(() => this.summary().valid && isPositive(this.amount()));

  constructor() {
    this.form.controls.amount.valueChanges.subscribe((v) => this.amountText.set(v));
    forkJoin({ parties: this.commercial.parties(this.ledgerId, this.side), mappings: this.commercial.mappings(this.ledgerId), accounts: inject(LedgerApiService).accounts(this.ledgerId), today: inject(BusinessClock).today(this.ledgerId) }).subscribe({
      next: ({ parties, mappings, accounts, today }) => {
        this.parties.set(parties);
        this.accounts.set(accounts.filter((a) => mappings.paymentAccounts.includes(a.id)));
        this.ready.set(mappings.paymentAccounts.length > 0);
        this.form.patchValue({ date: today });
        const q = this.route.snapshot.queryParamMap;
        const partyId = q.get('customerId') ?? q.get('supplierId') ?? '';
        if (partyId) {
          this.form.controls.partyId.setValue(partyId);
          this.loadDocs(partyId, q.get('invoiceId') ?? q.get('billId') ?? '');
        }
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => {
        this.serverError.set('clients.loadFailed');
        this.loading.set(false);
      },
    });
  }

  protected partyChosen(id: string): void {
    this.values.set({});
    this.openDocs.set([]);
    if (id) this.loadDocs(id, '');
  }

  private loadDocs(partyId: string, preselect: string): void {
    this.openDocuments.of(this.ledgerId, this.side, partyId).subscribe({
      next: (open) => {
        this.openDocs.set(open);
        const chosen = open.find((d) => d.id === preselect);
        if (chosen) {
          this.values.set({ [chosen.id]: toPlain(chosen.balance) });
          this.form.controls.amount.setValue(toPlain(chosen.balance));
        }
      },
      error: () => this.openDocs.set([]),
    });
  }

  protected setValues(next: Record<string, string>): void {
    this.values.set(next);
    this.form.markAsDirty();
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.canSubmit() || this.working()) return;
    const v = this.form.getRawValue();
    const allocations = this.summary()
      .rows.filter((r) => r.problem === null && isPositive(r.allocated))
      .map((r) => ({ docId: r.id, amount: toPlain(r.allocated) }));
    this.working.set(true);
    this.serverError.set(null);
    this.settlement.recordPayment(this.ledgerId, this.side, { partyId: v.partyId, date: v.date, accountId: v.accountId, amount: v.amount.trim(), allocations, ...(v.reference.trim() ? { reference: v.reference.trim() } : {}) }).subscribe({
      next: (p) => {
        this.done = true;
        void this.router.navigate([this.listLink, p.id]);
      },
      error: (e: unknown) => {
        this.working.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.done || !this.form.dirty) return true;
    this.leaving.set(true);
    return new Promise<boolean>((resolve) => (this.resolveLeave = resolve));
  }

  protected answerLeave(ok: boolean): void {
    this.leaving.set(false);
    this.resolveLeave?.(ok);
    this.resolveLeave = null;
  }
}
