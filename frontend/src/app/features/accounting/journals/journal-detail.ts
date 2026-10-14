import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { sum } from '../../../core/money/money';
import { CommentDialog } from '../../../shared/components/comment-dialog/comment-dialog';
import { ConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { JournalEntry } from '../accounting.models';
import { AccountingFormat, JOURNAL_TONE } from '../accounting-format';
import { JournalsApiService, ReverseResult } from '../journals-api.service';
import { LedgerContext } from '../ledger-context';
import { ReverseChoice, ReverseDialog } from './reverse-dialog';

type Dialog = 'approve' | 'reject' | 'reverse' | 'delete' | null;

/** One entry: lines, workflow timeline and the actions the status and the user's permissions allow. */
@Component({
  selector: 'app-journal-detail',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge, CommentDialog, ConfirmDialog, ReverseDialog],
  templateUrl: './journal-detail.html',
})
export class JournalDetail {
  private readonly api = inject(JournalsApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(AccountingFormat);
  protected readonly tone = JOURNAL_TONE;
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') as string;

  protected readonly entry = signal<JournalEntry | null>(null);
  protected readonly notFound = signal(false);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reversed = signal<ReverseResult | null>(null);

  /** Where the document behind a system-generated entry lives, so the ledger can be traced to its source. */
  protected readonly source = computed<string[] | null>(() => {
    const e = this.entry();
    if (!e?.sourceType || !e.sourceId) return null;
    const id = e.sourceId;
    switch (e.sourceType) {
      case 'invoice':
      case 'invoice_recognition':
        return ['/app/invoicing/invoices', id];
      case 'credit_note':
        return ['/app/invoicing/credit-notes'];
      case 'customer_payment':
      case 'customer_credit_allocation':
      case 'customer_refund':
        return ['/app/invoicing/payments', id];
      case 'supplier_bill':
        return ['/app/payables/bills', id];
      case 'supplier_credit':
        return ['/app/payables/credits'];
      case 'supplier_payment':
      case 'supplier_credit_allocation':
      case 'supplier_refund':
        return ['/app/payables/payments', id];
      case 'expense_claim':
      case 'expense_claim_payment':
        return ['/app/payables/expenses'];
      default:
        return null;
    }
  });
  protected readonly totalCredit = computed(() => sum((this.entry()?.lines ?? []).map((l) => l.credit)));
  protected readonly isOwn = computed(() => this.entry()?.createdBy === this.auth.user()?.id);
  protected readonly can = computed(() => {
    const e = this.entry();
    const has = (p: string) => this.auth.can(p);
    return {
      edit: e?.status === 'draft' && has('journals.update'),
      remove: e?.status === 'draft' && has('journals.delete'),
      submit: e?.status === 'draft' && has('journals.create'),
      decide: e?.status === 'pending_approval' && has('journals.approve'),
      post: e?.status === 'approved' && has('journals.post'),
      reverse: e?.status === 'posted' && !e.reversalOfId && has('journals.amend'),
    };
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.get(this.ledgerId, this.id).subscribe({ next: (e) => this.entry.set(e), error: () => this.notFound.set(true) });
  }

  /** One action at a time: the controls stay disabled while the request is in flight. */
  protected run(request: Observable<JournalEntry>): void {
    this.dialog.set(null);
    this.error.set(null);
    this.busy.set(true);
    request.subscribe({
      next: (e) => {
        this.entry.set(e);
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected submit(): void {
    this.run(this.api.submit(this.ledgerId, this.id));
  }

  protected approve(comment: string): void {
    this.run(this.api.approve(this.ledgerId, this.id, comment));
  }

  protected reject(reason: string): void {
    this.run(this.api.reject(this.ledgerId, this.id, reason));
  }

  protected post(): void {
    this.run(this.api.post(this.ledgerId, this.id));
  }

  protected reverse(choice: ReverseChoice): void {
    this.dialog.set(null);
    this.error.set(null);
    this.busy.set(true);
    this.api.reverse(this.ledgerId, this.id, choice).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.entry.set(result.original);
        this.reversed.set(result);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }

  protected remove(): void {
    this.dialog.set(null);
    this.busy.set(true);
    this.api.remove(this.ledgerId, this.id).subscribe({
      next: () => void this.router.navigate(['/app/accounting/journals']),
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }
}
