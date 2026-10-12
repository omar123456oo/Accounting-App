import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { cmp, isPositive, isValidAmount } from '../../core/money/money';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { Account } from '../accounting/accounting.models';
import { LedgerApiService } from '../accounting/ledger-api.service';
import { LedgerContext } from '../accounting/ledger-context';
import { OpenDoc, summarize } from './allocation';
import { AllocationTable } from './allocation-table';
import { BusinessClock, CommercialApiService } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { DocBase, Payment, Side } from './commercial.models';
import { OpenDocuments } from './open-documents';
import { SettlementApiService } from './settlement-api.service';

/**
 * One payment, laid out as a printable receipt (customers) or payment voucher (suppliers). A part that was not
 * allocated can be allocated later or refunded; every step posts its own journal.
 */
@Component({
  selector: 'app-payment-detail',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Modal, FieldError, AllocationTable],
  template: `
    @if (notFound()) {
      <div class="alert alert-danger" role="alert">{{ 'commercial.docs.notFound' | translate }}</div>
      <a [routerLink]="listLink">{{ 'commercial.docs.back' | translate }}</a>
    } @else if (payment(); as p) {
      <app-page-header [title]="(side === 'ar' ? 'commercial.payments.receipt' : 'commercial.payments.voucher') | translate: { number: p.number }">
        <button type="button" class="btn btn-outline-secondary no-print" (click)="print()">{{ 'accounting.reports.print' | translate }}</button>
      </app-page-header>
      @if (message(); as m) {
        <div class="alert alert-success no-print" role="status">{{ m | translate }}</div>
      }
      @if (error(); as e) {
        <div class="alert alert-danger" role="alert">{{ e }}</div>
      }
      <article id="receipt" class="card mb-3" [attr.aria-label]="'commercial.payments.' + side + '.title' | translate">
        <div class="card-body">
          <dl class="row mb-0">
            <dt class="col-5 col-md-3">{{ 'commercial.docs.col.' + side + 'Party' | translate }}</dt>
            <dd class="col-7 col-md-9">{{ p.partyName }}</dd>
            <dt class="col-5 col-md-3">{{ 'commercial.payments.date' | translate }}</dt>
            <dd class="col-7 col-md-9">{{ format.date(p.date) }}</dd>
            <dt class="col-5 col-md-3">{{ 'commercial.payments.account' | translate }}</dt>
            <dd class="col-7 col-md-9">{{ p.accountCode }} - {{ p.accountName }}</dd>
            @if (p.reference) {
              <dt class="col-5 col-md-3">{{ 'commercial.payments.reference' | translate }}</dt>
              <dd class="col-7 col-md-9">{{ p.reference }}</dd>
            }
            <dt class="col-5 col-md-3">{{ 'commercial.payments.amount' | translate }}</dt>
            <dd class="col-7 col-md-9 fw-bold" dir="ltr" id="receipt-amount">{{ format.amount(p.amount) }}</dd>
            <dt class="col-5 col-md-3">{{ 'commercial.payments.unapplied' | translate }}</dt>
            <dd class="col-7 col-md-9" dir="ltr" id="receipt-unapplied">{{ format.amount(p.unapplied) }}</dd>
          </dl>
        </div>
      </article>

      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="caption-top">{{ 'commercial.allocation.title' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'commercial.docs.col.reference' | translate }}</th>
              <th scope="col">{{ 'commercial.docs.col.date' | translate }}</th>
              <th scope="col">{{ 'commercial.allocation.amount' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (a of p.allocations; track $index) {
              <tr>
                <td dir="ltr" class="text-start"><a [routerLink]="[docBase, a.docId]">{{ a.docReference }}</a></td>
                <td>{{ format.date(a.date) }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(a.amount) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="text-body-secondary">{{ 'commercial.payments.noAllocations' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (p.refunds.length > 0) {
        <h2 class="h5">{{ 'commercial.payments.refunds' | translate }}</h2>
        <ul class="list-group mb-3">
          @for (r of p.refunds; track $index) {
            <li class="list-group-item">{{ format.date(r.date) }} - <span dir="ltr">{{ format.amount(r.amount) }}</span></li>
          }
        </ul>
      }
      @if (canRecord && isPositive(p.unapplied)) {
        <div class="d-flex flex-wrap gap-2 no-print">
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="openAllocate()">{{ 'commercial.payments.allocateLater' | translate }}</button>
          <button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="openRefund()">{{ 'commercial.payments.' + side + '.refund' | translate }}</button>
        </div>
      }

      @if (dialog() === 'allocate') {
        <app-modal [title]="'commercial.payments.allocateLater' | translate" width="48rem" (closed)="dialog.set(null)">
          <p class="small text-body-secondary">{{ 'commercial.payments.allocateIntro' | translate: { amount: format.amount(p.unapplied) } }}</p>
          <app-allocation-table [docs]="docs()" [values]="values()" [capacity]="p.unapplied" (valuesChange)="values.set($event)" />
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="dialog.set(null)">{{ 'common.cancel' | translate }}</button>
            <button type="button" class="btn btn-primary" [disabled]="busy() || !canAllocate(p)" (click)="allocate()">{{ 'commercial.payments.allocate' | translate }}</button>
          </div>
        </app-modal>
      }
      @if (dialog() === 'refund') {
        <app-modal [title]="'commercial.payments.' + side + '.refund' | translate" (closed)="dialog.set(null)">
          <form [formGroup]="refundForm" (ngSubmit)="refund(p)" novalidate>
            <div class="row g-3">
              <div class="col-12 col-md-6">
                <label for="refund-amount" class="form-label">{{ 'commercial.payments.amount' | translate }} *</label>
                <input id="refund-amount" class="form-control" dir="ltr" inputmode="decimal" formControlName="amount" [class.is-invalid]="refundForm.controls.amount.invalid && refundForm.controls.amount.touched" />
                <app-field-error [control]="refundForm.controls.amount" />
              </div>
              <div class="col-12 col-md-6">
                <label for="refund-date" class="form-label">{{ 'commercial.payments.date' | translate }} *</label>
                <input id="refund-date" type="date" class="form-control" formControlName="date" />
              </div>
              <div class="col-12">
                <label for="refund-account" class="form-label">{{ 'commercial.payments.account' | translate }} *</label>
                <select id="refund-account" class="form-select" formControlName="accountId">
                  <option value="">{{ 'commercial.lines.choose' | translate }}</option>
                  @for (a of accounts(); track a.id) {
                    <option [value]="a.id">{{ a.code }} - {{ format.base.name(a) }}</option>
                  }
                </select>
                <app-field-error [control]="refundForm.controls.accountId" />
              </div>
            </div>
            <div class="d-flex justify-content-end gap-2 mt-3">
              <button type="button" class="btn btn-outline-secondary" (click)="dialog.set(null)">{{ 'common.cancel' | translate }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'commercial.payments.refundNow' | translate }}</button>
            </div>
          </form>
        </app-modal>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class PaymentDetail {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(SettlementApiService);
  private readonly openDocuments = inject(OpenDocuments);
  private readonly commercial = inject(CommercialApiService);
  private readonly translate = inject(TranslateService);
  protected readonly format = inject(CommercialFormat);
  protected readonly isPositive = isPositive;
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  private readonly route = inject(ActivatedRoute);
  protected readonly side = this.route.snapshot.data['side'] as Side;
  private readonly id = this.route.snapshot.paramMap.get('id') as string;
  protected readonly listLink = this.side === 'ar' ? '/app/invoicing/payments' : '/app/payables/payments';
  protected readonly docBase = this.side === 'ar' ? '/app/invoicing/invoices' : '/app/payables/bills';
  protected readonly canRecord = inject(AuthService).can('payments.record');

  protected readonly payment = signal<Payment | null>(null);
  protected readonly notFound = signal(false);
  protected readonly dialog = signal<'allocate' | 'refund' | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly openDocs = signal<DocBase[]>([]);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly docs = computed<OpenDoc[]>(() => this.openDocs().map((d) => ({ id: d.id, reference: d.reference, dueDate: d.dueDate, balance: d.balance })));
  private today = '';

  protected readonly refundForm = this.fb.group({
    amount: ['', [Validators.required, (c: { value: string }) => (isValidAmount(String(c.value).trim()) && isPositive(String(c.value).trim()) ? null : { pattern: true })]],
    date: ['', Validators.required],
    accountId: ['', Validators.required],
  });

  constructor() {
    this.api.payment(this.ledgerId, this.side, this.id).subscribe({ next: (p) => this.payment.set(p), error: () => this.notFound.set(true) });
    inject(BusinessClock)
      .today(this.ledgerId)
      .subscribe((t) => (this.today = t));
    if (this.canRecord) {
      forkJoin({ mappings: this.commercial.mappings(this.ledgerId), accounts: inject(LedgerApiService).accounts(this.ledgerId) }).subscribe({ next: ({ mappings, accounts }) => this.accounts.set(accounts.filter((a) => mappings.paymentAccounts.includes(a.id))), error: () => this.accounts.set([]) });
    }
  }

  protected openAllocate(): void {
    const p = this.payment();
    if (!p) return;
    this.values.set({});
    this.openDocuments.of(this.ledgerId, this.side, p.partyId).subscribe({
      next: (open) => {
        this.openDocs.set(open);
        this.dialog.set('allocate');
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e)),
    });
  }

  protected canAllocate(p: Payment): boolean {
    const s = summarize(this.docs(), this.values(), p.unapplied);
    return s.valid && isPositive(s.allocated);
  }

  protected allocate(): void {
    const p = this.payment();
    if (!p) return;
    const rows = summarize(this.docs(), this.values(), p.unapplied).rows.filter((r) => r.problem === null && isPositive(r.allocated));
    this.run(this.api.allocate(this.ledgerId, this.side, p.id, rows.map((r) => ({ docId: r.id, amount: r.allocated })), this.today), 'commercial.payments.allocated');
  }

  protected openRefund(): void {
    const p = this.payment();
    if (!p) return;
    this.refundForm.reset({ amount: '', date: this.today, accountId: '' });
    this.dialog.set('refund');
  }

  protected refund(p: Payment): void {
    this.refundForm.markAllAsTouched();
    const v = this.refundForm.getRawValue();
    if (this.refundForm.invalid) return;
    if (cmp(v.amount.trim(), p.unapplied) > 0) {
      this.refundForm.controls.amount.setErrors({ server: this.translate.instant('commercial.payments.refundExceeds', { amount: this.format.amount(p.unapplied) }) });
      return;
    }
    this.run(this.api.refund(this.ledgerId, this.side, p.id, { amount: v.amount.trim(), accountId: v.accountId, date: v.date }), 'commercial.payments.refunded');
  }

  private run(request: ReturnType<SettlementApiService['allocate']>, done: string): void {
    this.dialog.set(null);
    this.error.set(null);
    this.message.set(null);
    this.busy.set(true);
    request.subscribe({
      next: (p) => {
        this.payment.set(p);
        this.busy.set(false);
        this.message.set(done);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected print(): void {
    window.print();
  }
}
