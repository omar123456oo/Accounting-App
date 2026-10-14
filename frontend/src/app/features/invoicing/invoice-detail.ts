import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { isPositive } from '../../core/money/money';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { LedgerContext } from '../accounting/ledger-context';
import { BusinessClock } from '../commercial/commercial-api.service';
import { CommercialFormat } from '../commercial/commercial-format';
import { CreditNote, Invoice } from '../commercial/commercial.models';
import { CreditNoteDialog } from '../commercial/credit-note-dialog';
import { DocHistory } from '../commercial/doc-history';
import { DocLinesTable } from '../commercial/doc-lines-table';
import { SettlementApiService } from '../commercial/settlement-api.service';
import { InvoicingApiService } from './invoicing-api.service';

type Dialog = 'reject' | 'approve' | 'credit' | 'recognize' | 'remind' | 'delete' | 'cancel' | null;

/** One invoice: the amounts, the actions its status and the user's permissions allow, the recognition schedule and the linked journals. */
@Component({
  selector: 'app-invoice-detail',
  imports: [RouterLink, FormsModule, TranslatePipe, PageHeader, StatusBadge, DocLinesTable, DocHistory, CommentDialog, ConfirmDialog, CreditNoteDialog, Modal],
  template: `
    @if (notFound()) {
      <div class="alert alert-danger" role="alert">{{ 'commercial.docs.notFound' | translate }}</div>
      <a routerLink="/app/invoicing/invoices">{{ 'commercial.docs.back' | translate }}</a>
    } @else if (invoice(); as inv) {
      <app-page-header [title]="inv.reference">
        <app-status-badge [label]="'commercial.status.' + inv.status | translate" [tone]="format.tone[inv.status]" />
      </app-page-header>
      <p class="text-body-secondary">
        <a [routerLink]="['/app/invoicing/statements', inv.partyId]">{{ inv.partyName }}</a>
        - {{ format.date(inv.date) }} - {{ 'commercial.docs.dueOn' | translate: { date: format.date(inv.dueDate) } }}
        ({{ 'commercial.parties.termsDays' | translate: { days: inv.termsDays } }})
      </p>

      @if (message(); as m) {
        <div class="alert alert-success" role="status">{{ m | translate }}</div>
      }
      @if (error(); as e) {
        <div class="alert alert-danger" role="alert">{{ e }}</div>
      }
      @if (inv.usesUnverifiedRate) {
        <div id="invoice-unverified" class="alert alert-warning" role="status">{{ 'commercial.tax.unverifiedWarning' | translate }}</div>
      }
      @if (inv.status === 'pending_approval' || (inv.status === 'draft' && inv.requiresApproval)) {
        <div class="alert alert-info" role="status">{{ 'commercial.docs.approvalNote' | translate }}</div>
      }

      <div class="d-flex flex-wrap gap-2 mb-3 no-print">
        @if (can().edit) {
          <a class="btn btn-outline-secondary" [routerLink]="['/app/invoicing/invoices', inv.id, 'edit']">{{ 'common.edit' | translate }}</a>
        }
        @if (can().submit) {
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="run(api.submit(ledgerId, inv.id), 'commercial.docs.submitted')">{{ 'commercial.docs.submit' | translate }}</button>
        }
        @if (can().issue) {
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="run(api.issue(ledgerId, inv.id), 'commercial.docs.issuedDone')">{{ 'commercial.docs.issue' | translate }}</button>
        }
        @if (can().decide) {
          <button type="button" class="btn btn-success" [disabled]="busy() || isOwn()" (click)="dialog.set('approve')">{{ 'commercial.docs.approveIssue' | translate }}</button>
          <button type="button" class="btn btn-outline-danger" [disabled]="busy()" (click)="dialog.set('reject')">{{ 'commercial.docs.reject' | translate }}</button>
        }
        @if (can().pay) {
          <a class="btn btn-primary" [routerLink]="['/app/invoicing/payments/new']" [queryParams]="{ customerId: inv.partyId, invoiceId: inv.id }">{{ 'commercial.payments.record' | translate }}</a>
        }
        @if (can().credit) {
          <button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="dialog.set('credit')">{{ 'commercial.credit.ar.title' | translate }}</button>
        }
        @if (can().remind) {
          <button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="dialog.set('remind')">{{ 'commercial.reminders.send' | translate }}</button>
        }
        @if (can().recognize) {
          <button type="button" class="btn btn-outline-secondary" [disabled]="busy()" (click)="dialog.set('recognize')">{{ 'commercial.recognition.action' | translate }}</button>
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

      <dl class="row mb-3" id="invoice-amounts">
        <dt class="col-6 col-md-2">{{ 'commercial.totals.total' | translate }}</dt>
        <dd class="col-6 col-md-2" dir="ltr">{{ format.amount(inv.total) }}</dd>
        <dt class="col-6 col-md-2">{{ 'commercial.docs.paid' | translate }}</dt>
        <dd class="col-6 col-md-2" dir="ltr" id="invoice-paid">{{ format.amount(inv.paid) }}</dd>
        <dt class="col-6 col-md-2">{{ 'commercial.docs.credited' | translate }}</dt>
        <dd class="col-6 col-md-2" dir="ltr">{{ format.amount(inv.credited) }}</dd>
        <dt class="col-6 col-md-2">{{ 'commercial.docs.col.balance' | translate }}</dt>
        <dd class="col-6 col-md-2 fw-bold" dir="ltr" id="invoice-balance">{{ format.amount(inv.balance) }}</dd>
      </dl>

      <app-doc-lines-table [lines]="inv.lines" [net]="inv.net" [taxTotal]="inv.taxTotal" [total]="inv.total" />

      @if (inv.schedule.length > 0) {
        <section aria-labelledby="schedule-title" class="mt-4">
          <h2 id="schedule-title" class="h5">{{ 'commercial.recognition.schedule' | translate }}</h2>
          <p class="small text-body-secondary">{{ 'commercial.recognition.scheduleNote' | translate: { start: format.date(inv.servicePeriodStart ?? inv.date), months: inv.servicePeriodMonths } }}</p>
          <div class="table-responsive">
            <table class="table table-sm align-middle" id="recognition-schedule">
              <caption class="visually-hidden">{{ 'commercial.recognition.schedule' | translate }}</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{{ 'commercial.docs.col.date' | translate }}</th>
                  <th scope="col">{{ 'commercial.totals.total' | translate }}</th>
                  <th scope="col">{{ 'commercial.docs.status' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of inv.schedule; track r.n) {
                  <tr>
                    <td>{{ r.n }}</td>
                    <td>{{ format.date(r.date) }}</td>
                    <td dir="ltr" class="text-end">{{ format.amount(r.amount) }}</td>
                    <td>{{ 'commercial.recognition.rowStatus.' + r.status | translate }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (credits().length > 0) {
        <section aria-labelledby="credits-title" class="mt-4">
          <h2 id="credits-title" class="h5">{{ 'commercial.credit.ar.list' | translate }}</h2>
          <ul class="list-group">
            @for (c of credits(); track c.id) {
              <li class="list-group-item">{{ c.number }} - {{ format.date(c.date) }} - <span dir="ltr">{{ format.amount(c.amount) }}</span> - {{ c.reason }}</li>
            }
          </ul>
        </section>
      }

      @if (inv.reminders.length > 0) {
        <section aria-labelledby="reminders-title" class="mt-4">
          <h2 id="reminders-title" class="h5">{{ 'commercial.reminders.title' | translate }}</h2>
          <p class="small text-body-secondary">{{ 'commercial.reminders.loggedOnly' | translate }}</p>
          <ul class="list-group">
            @for (r of inv.reminders; track r.at) {
              <li class="list-group-item">{{ format.dateTime(r.at) }} - {{ r.actor }}@if (r.note) { - {{ r.note }} } ({{ 'commercial.reminders.delivery' | translate }})</li>
            }
          </ul>
        </section>
      }

      <app-doc-history [journals]="inv.journals" [history]="inv.history" [ledgerId]="ledgerId" />

      @switch (dialog()) {
        @case ('approve') {
          <app-comment-dialog [title]="'commercial.docs.approveIssue' | translate" [label]="'accounting.journals.comment' | translate" [confirmLabel]="'commercial.docs.approveIssue' | translate" (confirmed)="dialog.set(null); run(api.approve(ledgerId, inv.id, $event), 'commercial.docs.issuedDone')" (cancelled)="dialog.set(null)" />
        }
        @case ('reject') {
          <app-comment-dialog [title]="'commercial.docs.reject' | translate" [label]="'accounting.journals.rejectReason' | translate" [confirmLabel]="'commercial.docs.reject' | translate" [required]="true" [danger]="true" (confirmed)="dialog.set(null); run(api.reject(ledgerId, inv.id, $event), 'commercial.docs.rejectedDone')" (cancelled)="dialog.set(null)" />
        }
        @case ('remind') {
          <app-comment-dialog [title]="'commercial.reminders.send' | translate" [message]="'commercial.reminders.loggedOnly' | translate" [label]="'commercial.reminders.note' | translate" [confirmLabel]="'commercial.reminders.log' | translate" (confirmed)="dialog.set(null); run(api.remind(ledgerId, inv.id, $event), 'commercial.reminders.done')" (cancelled)="dialog.set(null)" />
        }
        @case ('credit') {
          <app-credit-note-dialog side="ar" [doc]="inv" (done)="credited($event)" (cancelled)="dialog.set(null)" />
        }
        @case ('recognize') {
          <app-modal [title]="'commercial.recognition.action' | translate" (closed)="dialog.set(null)">
            <p class="small text-body-secondary">{{ 'commercial.recognition.intro' | translate }}</p>
            <label for="recognize-upto" class="form-label">{{ 'commercial.recognition.upTo' | translate }} *</label>
            <input id="recognize-upto" type="date" class="form-control" [ngModel]="upTo()" (ngModelChange)="upTo.set($event)" />
            <div class="d-flex justify-content-end gap-2 mt-3">
              <button type="button" class="btn btn-outline-secondary" (click)="dialog.set(null)">{{ 'common.cancel' | translate }}</button>
              <button type="button" class="btn btn-primary" [disabled]="!upTo() || busy()" (click)="recognize()">{{ 'commercial.recognition.run' | translate }}</button>
            </div>
          </app-modal>
        }
        @case ('cancel') {
          <app-confirm-dialog [title]="'commercial.docs.cancel' | translate" [message]="'commercial.docs.cancelConfirm' | translate" [confirmLabel]="'commercial.docs.cancel' | translate" [danger]="true" (confirmed)="dialog.set(null); run(api.cancel(ledgerId, inv.id), 'commercial.docs.cancelledDone')" (cancelled)="dialog.set(null)" />
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
export class InvoiceDetail {
  protected readonly api = inject(InvoicingApiService);
  private readonly settlement = inject(SettlementApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly format = inject(CommercialFormat);
  protected readonly ledgerId = inject(LedgerContext).activeId() as string;
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') as string;

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly credits = signal<CreditNote[]>([]);
  protected readonly notFound = signal(false);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly upTo = signal('');

  protected readonly isOwn = computed(() => this.invoice()?.createdBy === this.auth.user()?.id);
  protected readonly can = computed(() => {
    const i = this.invoice();
    const has = (p: string) => this.auth.can(p);
    const open = i?.status === 'issued' || i?.status === 'partially_paid' || i?.status === 'overdue';
    return {
      edit: i?.status === 'draft' && has('invoices.update'),
      remove: i?.status === 'draft' && has('invoices.delete'),
      submit: i?.status === 'draft' && !!i.requiresApproval && has('invoices.create'),
      issue: i?.status === 'draft' && !i.requiresApproval && has('invoices.issue'),
      decide: i?.status === 'pending_approval' && has('invoices.approve'),
      cancel: i?.status === 'pending_approval' && has('invoices.amend'),
      pay: open && has('payments.record'),
      credit: open && has('invoices.issue') && isPositive(i?.balance ?? '0'),
      remind: i?.status === 'overdue' && has('invoices.create'),
      recognize: !!i && i.schedule.some((r) => r.status === 'pending') && (open || i.status === 'paid') && has('invoices.issue'),
    };
  });

  constructor() {
    this.load();
    inject(BusinessClock)
      .today(this.ledgerId)
      .subscribe((t) => this.upTo.set(t));
  }

  private load(): void {
    this.api.get(this.ledgerId, this.id).subscribe({ next: (i) => this.set(i), error: () => this.notFound.set(true) });
  }

  private set(inv: Invoice): void {
    this.invoice.set(inv);
    if (inv.journals.length > 0 || inv.credited !== '0.0000') {
      this.settlement.creditNotes(this.ledgerId, 'ar', { docId: inv.id, pageSize: 100 }).subscribe({ next: (p) => this.credits.set(p.data), error: () => this.credits.set([]) });
    }
  }

  /** One action at a time: the controls stay disabled while the request is in flight. */
  protected run(request: Observable<Invoice>, done: string): void {
    this.error.set(null);
    this.message.set(null);
    this.busy.set(true);
    request.subscribe({
      next: (i) => {
        this.set(i);
        this.busy.set(false);
        this.message.set(done);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected recognize(): void {
    this.dialog.set(null);
    this.error.set(null);
    this.message.set(null);
    this.busy.set(true);
    this.api.recognize(this.ledgerId, this.id, this.upTo()).subscribe({
      next: (r) => {
        this.set(r.invoice);
        this.busy.set(false);
        this.message.set(r.recognized > 0 ? 'commercial.recognition.done' : 'commercial.recognition.nothing');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected credited(doc: unknown): void {
    this.dialog.set(null);
    this.set(doc as Invoice);
    this.message.set('commercial.credit.done');
  }

  protected remove(): void {
    this.dialog.set(null);
    this.busy.set(true);
    this.api.remove(this.ledgerId, this.id).subscribe({
      next: () => void this.router.navigate(['/app/invoicing/invoices']),
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
