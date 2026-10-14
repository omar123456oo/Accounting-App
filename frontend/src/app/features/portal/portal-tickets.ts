import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { EngageApiService } from '../engage/engage-api.service';
import { TICKET_CATEGORIES, Ticket, TicketSummary } from '../engage/engage.models';
import { TICKET_TONE } from '../engage/tickets-page';
import { TicketThread } from '../engage/ticket-thread';

/** The client's side of the ticket desk: ask a question, follow the answers, close it when done. */
@Component({
  selector: 'app-portal-tickets',
  imports: [ReactiveFormsModule, TranslatePipe, StatusBadge, Modal, FieldError, TicketThread],
  template: `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="h3 mb-0">{{ 'portal.tabs.tickets' | translate }}</h1>
      <button type="button" class="btn btn-primary" (click)="openNew()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'portal.tickets.new' | translate }}</button>
    </div>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    }
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }
    <div class="row g-4">
      <div class="col-lg-5">
        <div class="list-group shadow-sm">
          @for (t of list(); track t.id) {
            <button type="button" class="list-group-item list-group-item-action" [class.active]="t.id === ticket()?.id" (click)="open(t.id)">
              <div class="d-flex justify-content-between gap-2"><span class="fw-semibold">{{ t.subject }}</span><app-status-badge [label]="'tickets.statuses.' + t.status | translate" [tone]="tone[t.status]" /></div>
              <div class="small opacity-75">{{ 'tickets.categories.' + t.category | translate }} · {{ format.dateTime(t.updatedAt) }}</div>
            </button>
          } @empty {
            <div class="list-group-item text-body-secondary">{{ 'portal.tickets.none' | translate }}</div>
          }
        </div>
      </div>
      <div class="col-lg-7">
        @if (ticket(); as t) {
          <div class="card"><div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-3">
              <h2 class="h5 mb-0">{{ t.subject }}</h2>
              @if (t.status !== 'closed') {
                <button type="button" class="btn btn-outline-secondary btn-sm" (click)="close(t)">{{ 'tickets.close' | translate }}</button>
              }
            </div>
            <app-ticket-thread [ticket]="t" [busy]="busy()" (sent)="reply(t, $event.body)" />
          </div></div>
        } @else {
          <div class="text-body-secondary" role="status">{{ 'tickets.pick' | translate }}</div>
        }
      </div>
    </div>

    @if (creating()) {
      <app-modal [title]="'portal.tickets.new' | translate" (closed)="creating.set(false)">
        <form [formGroup]="form" (ngSubmit)="create()" novalidate>
          <div class="mb-3">
            <label for="nt-subject" class="form-label">{{ 'portal.tickets.subject' | translate }} *</label>
            <input id="nt-subject" class="form-control" formControlName="subject" [class.is-invalid]="form.controls.subject.invalid && form.controls.subject.touched" />
            <app-field-error [control]="form.controls.subject" />
          </div>
          <div class="mb-3">
            <label for="nt-cat" class="form-label">{{ 'portal.tickets.category' | translate }}</label>
            <select id="nt-cat" class="form-select" formControlName="category">
              @for (c of categories; track c) {
                <option [value]="c">{{ 'tickets.categories.' + c | translate }}</option>
              }
            </select>
          </div>
          <div class="mb-3">
            <label for="nt-body" class="form-label">{{ 'portal.tickets.body' | translate }} *</label>
            <textarea id="nt-body" class="form-control" rows="4" formControlName="body" [class.is-invalid]="form.controls.body.invalid && form.controls.body.touched"></textarea>
            <app-field-error [control]="form.controls.body" />
          </div>
          @if (formError(); as e) {
            <div class="alert alert-danger" role="alert">{{ e }}</div>
          }
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" (click)="creating.set(false)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary">{{ 'tickets.send' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class PortalTickets {
  private readonly api = inject(EngageApiService);
  private readonly location = inject(Location);
  protected readonly format = inject(ClientFormat);
  protected readonly categories = TICKET_CATEGORIES;
  protected readonly tone = TICKET_TONE;
  protected readonly list = signal<TicketSummary[]>([]);
  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    subject: ['', [Validators.required, Validators.maxLength(140)]],
    category: ['accounting' as (typeof TICKET_CATEGORIES)[number]],
    body: ['', Validators.required],
  });

  constructor() {
    this.load();
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id');
    if (id) this.open(id);
  }

  private load(): void {
    this.api.tickets('portal').subscribe({ next: (r) => this.list.set(r), error: () => this.failed.set(true) });
  }

  protected open(id: string): void {
    this.error.set(null);
    this.api.ticket('portal', id).subscribe({ next: (t) => this.ticket.set(t), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
    // Keep the address shareable without a full navigation (the page is already showing this ticket).
    this.location.replaceState('/portal/tickets/' + id);
  }

  protected openNew(): void {
    this.form.reset({ subject: '', category: 'accounting', body: '' });
    this.formError.set(null);
    this.creating.set(true);
  }

  protected create(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.api.createTicket(this.form.getRawValue()).subscribe({
      next: (t) => {
        this.creating.set(false);
        this.ticket.set(t);
        this.load();
      },
      error: (e: unknown) => {
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.formError.set(Object.keys(fieldErrors(e)).length ? null : apiErrorMessage(e));
      },
    });
  }

  protected reply(t: Ticket, body: string): void {
    this.busy.set(true);
    this.api.reply('portal', t.id, body).subscribe({
      next: (u) => {
        this.busy.set(false);
        this.ticket.set(u);
        this.load();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected close(t: Ticket): void {
    this.api.closeTicket(t.id).subscribe({ next: (u) => (this.ticket.set(u), this.load()), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
