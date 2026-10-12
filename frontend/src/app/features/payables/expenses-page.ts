import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { Account } from '../accounting/accounting.models';
import { LedgerApiService } from '../accounting/ledger-api.service';
import { LedgerContext } from '../accounting/ledger-context';
import { BudgetReport, ExpenseCategory, ExpenseClaim } from '../commercial/commercial.models';
import { BusinessClock, CommercialApiService } from '../commercial/commercial-api.service';
import { CommercialFormat } from '../commercial/commercial-format';
import { ClaimForm } from './claim-form';
import { PayablesApiService } from './payables-api.service';

type Dialog = { kind: 'reject' | 'approve' | 'pay'; claim: ExpenseClaim } | 'new' | null;

/** Employee expense claims with receipts and approval, plus a read-only monthly budget against actual spending. */
@Component({
  selector: 'app-expenses-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, StatusBadge, CommentDialog, Modal, FieldError, ClaimForm],
  template: `
    <app-page-header [title]="'commercial.claims.title' | translate">
      @if (auth.can('expenses.claim')) {
        <button type="button" class="btn btn-primary" (click)="dialog.set('new')">{{ 'commercial.claims.new' | translate }}</button>
      }
    </app-page-header>

    @if (budget(); as b) {
      <section aria-labelledby="budget-title" class="mb-4">
        <h2 id="budget-title" class="h5">{{ 'commercial.budget.title' | translate }} - {{ b.month }}</h2>
        <p class="small text-body-secondary">{{ 'commercial.budget.note' | translate }}</p>
        <div class="table-responsive">
          <table class="table table-sm align-middle" id="budget-table">
            <caption class="visually-hidden">{{ 'commercial.budget.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.lines.category' | translate }}</th>
                <th scope="col">{{ 'commercial.budget.budget' | translate }}</th>
                <th scope="col">{{ 'commercial.budget.actual' | translate }}</th>
                <th scope="col">{{ 'commercial.budget.remaining' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.status' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of b.rows; track r.categoryId) {
                <tr>
                  <td>{{ format.name(r) }}</td>
                  <td dir="ltr" class="text-end">{{ r.budget ? format.amount(r.budget) : '-' }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(r.actual) }}</td>
                  <td dir="ltr" class="text-end">{{ r.remaining ? format.amount(r.remaining) : '-' }}</td>
                  <td>{{ (r.over ? 'commercial.budget.over' : r.budget ? 'commercial.budget.within' : 'commercial.budget.none') | translate }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    <h2 class="h5">{{ 'commercial.claims.list' | translate }}</h2>
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (claims(); as list) {
      @if (list.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.claims.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle" id="claims-table">
            <caption class="visually-hidden">{{ 'commercial.claims.list' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.docs.col.reference' | translate }}</th>
                <th scope="col">{{ 'commercial.claims.claimant' | translate }}</th>
                <th scope="col">{{ 'commercial.claims.date' | translate }}</th>
                <th scope="col">{{ 'commercial.claims.description' | translate }}</th>
                <th scope="col">{{ 'commercial.claims.amount' | translate }}</th>
                <th scope="col">{{ 'commercial.claims.receipt' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.status' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (c of list; track c.id) {
                <tr>
                  <td dir="ltr" class="text-start">{{ c.reference }}</td>
                  <td>{{ c.claimantName }}</td>
                  <td>{{ format.date(c.date) }}</td>
                  <td>
                    {{ c.description }}
                    <span class="d-block small text-body-secondary">{{ categoryName(c.categoryId) }} - {{ 'commercial.docs.bearers.' + c.bearer | translate }}</span>
                    @if (c.decisionNote) {
                      <span class="d-block small text-body-secondary">{{ c.decisionNote }}</span>
                    }
                  </td>
                  <td dir="ltr" class="text-end">{{ format.amount(c.amount) }}</td>
                  <td dir="ltr" class="text-start small">{{ c.receipt.name }}</td>
                  <td><app-status-badge [label]="'commercial.claims.status.' + c.status | translate" [tone]="format.tone[c.status] ?? 'secondary'" /></td>
                  <td class="text-end">
                    <span class="d-inline-flex flex-wrap gap-1">
                      @if (c.status === 'submitted' && auth.can('bills.approve')) {
                        <button type="button" class="btn btn-outline-success btn-sm" [disabled]="busy() || c.claimantId === auth.user()?.id" (click)="dialog.set({ kind: 'approve', claim: c })">{{ 'commercial.docs.approve' | translate }}<span class="visually-hidden"> {{ c.reference }}</span></button>
                        <button type="button" class="btn btn-outline-danger btn-sm" [disabled]="busy()" (click)="dialog.set({ kind: 'reject', claim: c })">{{ 'commercial.docs.reject' | translate }}<span class="visually-hidden"> {{ c.reference }}</span></button>
                      }
                      @if (c.status === 'approved' && auth.can('payments.record')) {
                        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="openPay(c)">{{ 'commercial.claims.pay' | translate }}<span class="visually-hidden"> {{ c.reference }}</span></button>
                      }
                    </span>
                    @if (c.status === 'submitted' && c.claimantId === auth.user()?.id && auth.can('bills.approve')) {
                      <span class="d-block small text-body-secondary">{{ 'commercial.docs.fourEyesNote' | translate }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }

    @if (dialog(); as d) {
      @if (d === 'new') {
        <app-claim-form [categories]="categories()" (created)="created()" (cancelled)="dialog.set(null)" />
      } @else if (d.kind === 'reject') {
        <app-comment-dialog [title]="'commercial.docs.reject' | translate" [label]="'accounting.journals.rejectReason' | translate" [confirmLabel]="'commercial.docs.reject' | translate" [required]="true" [danger]="true" (confirmed)="decide(api.rejectClaim(ledgerId, d.claim.id, $event))" (cancelled)="dialog.set(null)" />
      } @else if (d.kind === 'approve') {
        <app-comment-dialog [title]="'commercial.docs.approve' | translate" [label]="'accounting.journals.comment' | translate" [confirmLabel]="'commercial.docs.approve' | translate" (confirmed)="decide(api.approveClaim(ledgerId, d.claim.id, $event))" (cancelled)="dialog.set(null)" />
      } @else {
        <app-modal [title]="'commercial.claims.pay' | translate" (closed)="dialog.set(null)">
          <form [formGroup]="payForm" (ngSubmit)="pay(d.claim)" novalidate>
            <label for="claim-pay-account" class="form-label">{{ 'commercial.payments.account' | translate }} *</label>
            <select id="claim-pay-account" class="form-select" formControlName="accountId">
              <option value="">{{ 'commercial.lines.choose' | translate }}</option>
              @for (a of accounts(); track a.id) {
                <option [value]="a.id">{{ a.code }} - {{ format.base.name(a) }}</option>
              }
            </select>
            <app-field-error [control]="payForm.controls.accountId" />
            <label for="claim-pay-date" class="form-label mt-3">{{ 'commercial.payments.date' | translate }} *</label>
            <input id="claim-pay-date" type="date" class="form-control" formControlName="date" />
            <div class="d-flex justify-content-end gap-2 mt-3">
              <button type="button" class="btn btn-outline-secondary" (click)="dialog.set(null)">{{ 'common.cancel' | translate }}</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'commercial.claims.pay' | translate }}</button>
            </div>
          </form>
        </app-modal>
      }
    }
  `,
})
export class ExpensesPage {
  protected readonly auth = inject(AuthService);
  protected readonly api = inject(PayablesApiService);
  private readonly commercial = inject(CommercialApiService);
  private readonly ledgerApi = inject(LedgerApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly format = inject(CommercialFormat);
  protected readonly ledgerId = inject(LedgerContext).activeId() as string;

  protected readonly claims = signal<ExpenseClaim[] | null>(null);
  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly budget = signal<BudgetReport | null>(null);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<Dialog>(null);
  private readonly categoryNames = computed(() => new Map(this.categories().map((c) => [c.id, this.format.name(c)])));
  private today = '';

  protected readonly payForm = this.fb.group({ accountId: ['', Validators.required], date: ['', Validators.required] });

  constructor() {
    this.loadClaims();
    this.commercial.categories(this.ledgerId).subscribe({ next: (c) => this.categories.set(c), error: () => this.categories.set([]) });
    inject(BusinessClock)
      .today(this.ledgerId)
      .subscribe((t) => (this.today = t));
    if (this.auth.can('bills.view')) this.commercial.budget(this.ledgerId).subscribe({ next: (b) => this.budget.set(b), error: () => this.budget.set(null) });
  }

  protected categoryName(id: string): string {
    return this.categoryNames().get(id) ?? '';
  }

  private loadClaims(): void {
    this.api.claims(this.ledgerId).subscribe({ next: (p) => this.claims.set(p.data), error: () => this.failed.set(true) });
  }

  protected created(): void {
    this.dialog.set(null);
    this.loadClaims();
  }

  protected decide(request: ReturnType<PayablesApiService['approveClaim']>): void {
    this.dialog.set(null);
    this.run(request);
  }

  protected openPay(claim: ExpenseClaim): void {
    this.payForm.reset({ accountId: '', date: this.today });
    if (this.accounts().length === 0) {
      forkJoin({ mappings: this.commercial.mappings(this.ledgerId), accounts: this.ledgerApi.accounts(this.ledgerId) }).subscribe({
        next: ({ mappings, accounts }) => this.accounts.set(accounts.filter((a) => mappings.paymentAccounts.includes(a.id))),
        error: () => this.accounts.set([]),
      });
    }
    this.dialog.set({ kind: 'pay', claim });
  }

  protected pay(claim: ExpenseClaim): void {
    this.payForm.markAllAsTouched();
    if (this.payForm.invalid) return;
    const v = this.payForm.getRawValue();
    this.dialog.set(null);
    this.run(this.api.payClaim(this.ledgerId, claim.id, { accountId: v.accountId, date: v.date }));
  }

  private run(request: ReturnType<PayablesApiService['approveClaim']>): void {
    this.error.set(null);
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.loadClaims();
        if (this.auth.can('bills.view')) this.commercial.budget(this.ledgerId).subscribe({ next: (b) => this.budget.set(b) });
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}
