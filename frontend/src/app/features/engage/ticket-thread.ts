import { Component, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ClientFormat } from '../clients/client-format';
import { Ticket } from './engage.models';

/** The messages of one ticket and the reply box. Staff can mark a reply as an internal note the client never sees. */
@Component({
  selector: 'app-ticket-thread',
  imports: [TranslatePipe],
  template: `
    <div class="d-flex flex-column gap-3 mb-3" role="log" [attr.aria-label]="'tickets.thread' | translate">
      @for (m of ticket().messages; track m.id) {
        <div class="card" [class.border-warning]="m.internal" [class.bg-body-tertiary]="m.side === 'staff' && !m.internal">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between small text-body-secondary">
              <span>
                <strong class="text-body">{{ m.authorName }}</strong>
                @if (m.internal) {
                  <span class="badge text-bg-warning ms-1">{{ 'tickets.internal' | translate }}</span>
                }
              </span>
              <span>{{ format.dateTime(m.at) }}</span>
            </div>
            <div class="mt-1" style="white-space: pre-wrap">{{ m.body }}</div>
          </div>
        </div>
      }
    </div>
    @if (ticket().status === 'closed') {
      <div class="alert alert-secondary" role="status">{{ 'tickets.closedNote' | translate }}</div>
    } @else {
      <form (submit)="$event.preventDefault(); send()">
        <label for="reply-body" class="form-label">{{ 'tickets.reply' | translate }}</label>
        <textarea id="reply-body" class="form-control" rows="3" [value]="body()" (input)="body.set($any($event.target).value)" [class.is-invalid]="empty()"></textarea>
        @if (empty()) {
          <div class="invalid-feedback d-block" role="alert">{{ 'validation.required' | translate }}</div>
        }
        <div class="d-flex flex-wrap align-items-center gap-3 mt-2">
          <button type="submit" class="btn btn-primary" [disabled]="busy()"><i class="fa-solid fa-paper-plane me-1" aria-hidden="true"></i>{{ 'tickets.send' | translate }}</button>
          @if (staff()) {
            <div class="form-check mb-0">
              <input id="reply-internal" type="checkbox" class="form-check-input" [checked]="internal()" (change)="internal.set($any($event.target).checked)" />
              <label for="reply-internal" class="form-check-label">{{ 'tickets.internalNote' | translate }}</label>
            </div>
          }
        </div>
      </form>
    }
  `,
})
export class TicketThread {
  readonly ticket = input.required<Ticket>();
  readonly staff = input(false);
  readonly busy = input(false);
  readonly sent = output<{ body: string; internal: boolean }>();
  protected readonly format = inject(ClientFormat);
  protected readonly body = signal('');
  protected readonly internal = signal(false);
  protected readonly empty = signal(false);

  protected send(): void {
    if (!this.body().trim()) {
      this.empty.set(true);
      return;
    }
    this.empty.set(false);
    this.sent.emit({ body: this.body().trim(), internal: this.staff() && this.internal() });
    this.body.set('');
    this.internal.set(false);
  }
}
