import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { isPositive } from '../../core/money/money';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { LedgerContext } from '../accounting/ledger-context';
import { CommercialFormat } from '../commercial/commercial-format';
import { Bill, CreditNote } from '../commercial/commercial.models';
import { CreditNoteDialog } from '../commercial/credit-note-dialog';
import { DocHistory } from '../commercial/doc-history';
import { DocLinesTable } from '../commercial/doc-lines-table';
import { SettlementApiService } from '../commercial/settlement-api.service';
import { PayablesApiService } from './payables-api.service';

type Dialog = 'approve' | 'reject' | 'credit' | 'delete' | 'cancel' | null;

/** One supplier bill: amounts, the actions its status and the user's permissions allow, and the linked journals. */
@Component({
  selector: 'app-bill-detail',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge, DocLinesTable, DocHistory, CommentDialog, ConfirmDialog, CreditNoteDialog],
  template: `
    @if (notFound()) {
      <div class="alert alert-danger" role="alert">{{ 'commercial.docs.notFound' | translate }}</div>
      <a routerLink="/app/payables/bills">{{ 'commercial.docs.back' | translate }}</a>
    } @else if (bill(); as b) {
      <app-page-header [title]="b.reference">
        <app-status-badge [label]="'commercial.status.' + b.status | translate" [tone]="format.tone[b.status]" />
      </app-page-header>
      <p class="text-body-secondary">
        <a [routerLink]="['/app/payables/statements', b.partyId]">{{ b.partyName }}</a>
        - {{ format.date(b.date) }} - {{ 'commercial.docs.dueOn' | translate: { date: format.date(b.dueDate) } }}
        @if (b.supplierInvoiceNo) { - {{ 'commercial.docs.supplierInvoiceNo' | translate }}: <span dir="ltr">{{ b.supplierInvoiceNo }}</span> }
      </p>
      <p>
        <span class="badge text-bg-secondary">{{ 'commercial.docs.bearers.' + b.bearer | translate }}</span>
        @if (b.clientName) { <span class="ms-2">{{ 'commercial.docs.forClient' | translate: { name: b.clientName } }}</span> }
        @if (b.rebilledInvoiceId) { <a class="ms-2" [routerLink]="['/app/invoicing/invoices', b.rebilledInvoiceId]">{{ 'commercial.docs.rebilledTo' | translate }}</a> }
      </p>

      @if (message(); as m) {
        <div class="alert alert-success" role="status">{{ m | translate }}</div>
      }
      @if (error(); as e) {
        <div class="alert alert-danger" role="alert">{{ e }}</div>
      }
      @if (b.usesUnverifiedRate) {
        <div class="alert alert-warning" role="status">{{ 'commercial.tax.unverifiedWarning' | translate }}</div>
      }

      <div class="d-flex flex-wrap gap-2 mb-3 no-print">
        @if (can().edit) {
          <a class="btn btn-outline-secondary" [routerLink]="['/app/payables/bills', b.id, 'edit']">{{ 'common.edit' | translate }}</a>
        }
        @if (can().submit) {
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="run(api.submit(ledgerId, b.id), 'commercial.docs.submitted')">{{ 'commercial.docs.submit' | translate }}</button>
        }
        @if (can().decide) {
          <button type="button" class="btn btn-success" [disabled]="busy() || isOwn()" (click)="dialog.set('approve')">{{ 'commercial.docs.approvePost' | translate }}</button>
          <button type="button" class="btn btn-outline-danger" [disabled]="busy()" (click)="dialog.set('reject')">{{ 'commercial.docs.reject' | translate }}</button>
        }
        @if (can().pay) {
          <a class="btn btn-primary" routerLink="/app/payables/payments/new" [queryParams]="{ supplierId: b.partyId, billId: b.id }">{{ 'commercial.payments.ap.new' | translate }}</a>
        }
        @if (can().credit) {
          <button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="dialog.set('credit')">{{ 'commercial.credit.ap.title' | translate }}</button>
        }
        @if (can().rebill) {
          <button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="rebill()">{{ 'commercial.docs.rebill' | translate }}</button>
        }
        @if (can().cancel) {
          <button type="button" class="btn btn-outline-danger" [disabled]="busy()" (click)="dialog.set('cancel')">{{ 'commercial.docs.cancel' | translate }}</button>
        }
        @if (can().remove) {
          <button type="button" class="btn btn-outline-danger" [disabled]="busy()" (click)="dialog.set('delete')">{{ 'common.delete' | translate }}</button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="print()">{{ 'accounting.reports.print' | translate }}</button>
      </div>
      @if (can().decide && isOwn()) {
        <p class="small text-body-secondary">{{ 'commercial.docs.fourEyesNote' | translate }}</p>
      }
      @if (b.status === 'pending_approval') {
        <p class="small text-body-secondary">{{ 'commercial.docs.limitNote' | translate }}</p>
      }

      <dl class="row mb-3">
        <dt class="col-6 col-md-2">{{ 'commercial.totals.total' | translate }}</dt>
        <dd class="col-6 col-md-2" dir="ltr">{{ format.amount(b.total) }}</dd>
        <dt class="col-6 col-md-2">{{ 'commercial.docs.paid' | translate }}</dt>
        <dd class="col-6 col-md-2" dir="ltr" id="bill-paid">{{ format.amount(b.paid) }}</dd>
        <dt class="col-6 col-md-2">{{ 'commercial.docs.credited' | translate }}</dt>
        <dd class="col-6 col-md-2" dir="ltr">{{ format.amount(b.credited) }}</dd>
        <dt class="col-6 col-md-2">{{ 'commercial.docs.col.balance' | translate }}</dt>
        <dd class="col-6 col-md-2 fw-bold" dir="ltr" id="bill-balance">{{ format.amount(b.balance) }}</dd>
      </dl>

      <app-doc-lines-table [lines]="b.lines" [net]="b.net" [taxTotal]="b.taxTotal" [total]="b.total" />

      @if (credits().length > 0) {
        <section aria-labelledby="credits-title" class="mt-4">
          <h2 id="credits-title" class="h5">{{ 'commercial.credit.ap.list' | translate }}</h2>
          <ul class="list-group">
            @for (c of credits(); track c.id) {
              <li class="list-group-item">{{ c.number }} - {{ format.date(c.date) }} - <span dir="ltr">{{ format.amount(c.amount) }}</span> - {{ c.reason }}</li>
            }
          </ul>
        </section>
      }

      <app-doc-history [journals]="b.journals" [history]="b.history" [ledgerId]="ledgerId" />

      @switch (dialog()) {
        @case ('approve') {
          <app-comment-dialog [title]="'commercial.docs.approvePost' | translate" [label]="'accounting.journals.comment' | translate" [confirmLabel]="'commercial.docs.approvePost' | translate" (confirmed)="dialog.set(null); run(api.approve(ledgerId, b.id, $event), 'commercial.docs.approvedDone')" (cancelled)="dialog.set(null)" />
        }
        @case ('reject') {
          <app-comment-dialog [title]="'commercial.docs.reject' | translate" [label]="'accounting.journals.rejectReason' | translate" [confirmLabel]="'commercial.docs.reject' | translate" [required]="true" [danger]="true" (confirmed)="dialog.set(null); run(api.reject(ledgerId, b.id, $event), 'commercial.docs.rejectedDone')" (cancelled)="dialog.set(null)" />
        }
        @case ('credit') {
          <app-credit-note-dialog side="ap" [doc]="b" (done)="credited($event)" (cancelled)="dialog.set(null)" />
        }
        @case ('cancel') {
          <app-confirm-dialog [title]="'commercial.docs.cancel' | translate" [message]="'commercial.docs.cancelConfirm' | translate" [confirmLabel]="'commercial.docs.cancel' | translate" [danger]="true" (confirmed)="dialog.set(null); run(api.cancel(ledgerId, b.id), 'commercial.docs.cancelledDone')" (cancelled)="dialog.set(null)" />
        }
        @case ('delete') {
          <app-confirm-dialog [title]="'common.delete' | translate" [message]="'commercial.docs.deleteConfirm' | translate" [confirmLabel]="'common.delete' | translate" [danger]="true" (confirmed)="remove()" (cancelled)="dialog.set(null)" />
        }
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class BillDetail {
  protected readonly api = inject(PayablesApiService);
  private readonly settlement = inject(SettlementApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(CommercialFormat);
  protected readonly ledgerId = inject(LedgerContext).activeId() as string;
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') as string;

  protected readonly bill = signal<Bill | null>(null);
  protected readonly credits = signal<CreditNote[]>([]);
  protected readonly notFound = signal(false);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly isOwn = computed(() => this.bill()?.createdBy === this.auth.user()?.id);
  protected readonly can = computed(() => {
    const b = this.bill();
    const has = (p: string) => this.auth.can(p);
    const open = b?.status === 'approved' || b?.status === 'partially_paid' || b?.status === 'overdue';
    return {
      edit: b?.status === 'draft' && has('bills.update'),
      remove: b?.status === 'draft' && has('bills.delete'),
      submit: b?.status === 'draft' && has('bills.create'),
      decide: b?.status === 'pending_approval' && has('bills.approve'),
      cancel: b?.status === 'pending_approval' && has('bills.amend'),
      pay: open && has('payments.record'),
      credit: open && has('bills.approve') && isPositive(b?.balance ?? '0') && !b?.rebilledInvoiceId,
      rebill: !!b && b.bearer === 'client_reimbursable' && !!b.number && !b.rebilledInvoiceId && b.status !== 'cancelled' && has('invoices.create'),
    };
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.get(this.ledgerId, this.id).subscribe({ next: (b) => this.set(b), error: () => this.notFound.set(true) });
  }

  private set(b: Bill): void {
    this.bill.set(b);
    if (b.journals.length > 0) this.settlement.creditNotes(this.ledgerId, 'ap', { docId: b.id, pageSize: 100 }).subscribe({ next: (p) => this.credits.set(p.data), error: () => this.credits.set([]) });
  }

  protected run(request: Observable<Bill>, done: string): void {
    this.error.set(null);
    this.message.set(null);
    this.busy.set(true);
    request.subscribe({
      next: (b) => {
        this.set(b);
        this.busy.set(false);
        this.message.set(done);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  /** Adds the expense to a draft invoice of the customer linked to the client, then opens that invoice. */
  protected rebill(): void {
    this.error.set(null);
    this.busy.set(true);
    this.api.rebill(this.ledgerId, this.id).subscribe({
      next: (r) => void this.router.navigate(['/app/invoicing/invoices', r.invoiceId]),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected credited(doc: unknown): void {
    this.dialog.set(null);
    this.set(doc as Bill);
    this.message.set('commercial.credit.done');
  }

  protected remove(): void {
    this.dialog.set(null);
    this.busy.set(true);
    this.api.remove(this.ledgerId, this.id).subscribe({
      next: () => void this.router.navigate(['/app/payables/bills']),
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
