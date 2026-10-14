import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge, BadgeTone } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { ClientsApiService } from '../clients/clients-api.service';
import { EngageApiService } from './engage-api.service';
import { ChartCard, ChartItem, PieChart } from '../analytics/analytics-charts';
import { TICKET_CATEGORIES, TICKET_STATUSES, Ticket, TicketStatus, TicketSummary } from './engage.models';
import { TicketThread } from './ticket-thread';

export const TICKET_TONE: Record<TicketStatus, BadgeTone> = { open: 'warning', answered: 'info', closed: 'secondary' };

/** The office's ticket desk: every client conversation the signed-in person may see, answered in place. */
@Component({
  selector: 'app-tickets-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, TicketThread, ChartCard, PieChart],
  template: `
    <app-page-header [title]="'tickets.title' | translate" />
    <div class="row g-3 mb-3">
      <div class="col-md-6"><app-chart-card [title]="'analytics.support.ticketsByStatus' | translate"><app-pie-chart [items]="byStatus()" [label]="'analytics.support.ticketsByStatus' | translate" [empty]="'tickets.none' | translate" /></app-chart-card></div>
      <div class="col-md-6"><app-chart-card [title]="'analytics.support.ticketsByCategory' | translate"><app-pie-chart [items]="byCategory()" [label]="'analytics.support.ticketsByCategory' | translate" [empty]="'tickets.none' | translate" /></app-chart-card></div>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <label for="tk-status" class="visually-hidden">{{ 'tickets.status' | translate }}</label>
      <select id="tk-status" class="form-select w-auto" [value]="status()" (change)="setStatus($any($event.target).value)">
        <option value="">{{ 'tickets.anyStatus' | translate }}</option>
        @for (s of statuses; track s) {
          <option [value]="s">{{ 'tickets.statuses.' + s | translate }}</option>
        }
      </select>
      <div class="form-check form-switch align-self-center mb-0">
        <input id="tk-mine" type="checkbox" role="switch" class="form-check-input" [checked]="mine()" (change)="setMine($any($event.target).checked)" />
        <label for="tk-mine" class="form-check-label">{{ 'tickets.mine' | translate }}</label>
      </div>
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
            <button type="button" class="list-group-item list-group-item-action" [class.active]="t.id === selectedId()" (click)="open(t.id)">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <span class="fw-semibold">{{ t.subject }}</span>
                <app-status-badge [label]="'tickets.statuses.' + t.status | translate" [tone]="tone[t.status]" />
              </div>
              <div class="small opacity-75">{{ t.clientName }} · {{ 'tickets.categories.' + t.category | translate }}</div>
              <div class="small opacity-75">
                {{ format.dateTime(t.updatedAt) }}
                @if (t.lastSide === 'client' && t.status !== 'closed') {
                  · <strong>{{ 'tickets.awaitingUs' | translate }}</strong>
                }
              </div>
            </button>
          } @empty {
            <div class="list-group-item text-body-secondary">{{ 'tickets.none' | translate }}</div>
          }
        </div>
      </div>
      <div class="col-lg-7">
        @if (ticket(); as t) {
          <div class="card"><div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
              <div>
                <h2 class="h5 mb-1">{{ t.subject }}</h2>
                <div class="small text-body-secondary">{{ t.clientName }} · {{ 'tickets.categories.' + t.category | translate }} · {{ t.createdByName }}</div>
              </div>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <label for="tk-assignee" class="visually-hidden">{{ 'tickets.assignee' | translate }}</label>
                <select id="tk-assignee" class="form-select form-select-sm w-auto" [value]="t.assigneeId ?? ''" (change)="assign(t, $any($event.target).value)">
                  <option value="">{{ 'tickets.unassigned' | translate }}</option>
                  @for (u of staff(); track u.id) {
                    <option [value]="u.id">{{ u.name }}</option>
                  }
                </select>
                @if (t.status !== 'closed') {
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="setTicketStatus(t, 'closed')">{{ 'tickets.close' | translate }}</button>
                } @else {
                  <button type="button" class="btn btn-outline-primary btn-sm" (click)="setTicketStatus(t, 'open')">{{ 'tickets.reopen' | translate }}</button>
                }
              </div>
            </div>
            <app-ticket-thread [ticket]="t" [staff]="true" [busy]="busy()" (sent)="reply(t, $event)" />
          </div></div>
        } @else {
          <div class="text-body-secondary" role="status">{{ 'tickets.pick' | translate }}</div>
        }
      </div>
    </div>
  `,
})
export class TicketsPage {
  private readonly api = inject(EngageApiService);
  private readonly clients = inject(ClientsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  protected readonly format = inject(ClientFormat);
  protected readonly statuses = TICKET_STATUSES;
  protected readonly tone = TICKET_TONE;
  protected readonly list = signal<TicketSummary[]>([]);
  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly staff = signal<Array<{ id: string; name: string }>>([]);
  protected readonly status = signal('');
  protected readonly mine = signal(false);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly all = signal<TicketSummary[]>([]);
  protected readonly byStatus = computed(() => TICKET_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'tickets.statuses.' + s, value: this.all().filter((t) => t.status === s).length, tone: ({ open: 'warning', answered: 'info', closed: 'secondary' } as const)[s] })));
  protected readonly byCategory = computed(() => TICKET_CATEGORIES.map((c): ChartItem => ({ label: '', labelKey: 'tickets.categories.' + c, value: this.all().filter((t) => t.category === c).length })));
  protected readonly selectedId = computed(() => this.ticket()?.id ?? null);

  constructor() {
    this.clients.assignableUsers().subscribe((u) => this.staff.set(u));
    this.load();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.open(id);
  }

  private load(): void {
    this.api.tickets('staff', {}).subscribe({ next: (r) => this.all.set(r), error: () => undefined });
    this.api.tickets('staff', { status: this.status(), mine: this.mine() }).subscribe({ next: (r) => this.list.set(r), error: () => this.failed.set(true) });
  }

  protected setStatus(v: string): void {
    this.status.set(v);
    this.load();
  }

  protected setMine(v: boolean): void {
    this.mine.set(v);
    this.load();
  }

  protected open(id: string): void {
    this.error.set(null);
    this.api.ticket('staff', id).subscribe({ next: (t) => this.ticket.set(t), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
    // Keep the address shareable without a full navigation (the page is already showing this ticket).
    this.location.replaceState('/app/tickets/' + id);
  }

  protected reply(t: Ticket, v: { body: string; internal: boolean }): void {
    this.busy.set(true);
    this.api.reply('staff', t.id, v.body, v.internal).subscribe({
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

  protected setTicketStatus(t: Ticket, status: string): void {
    this.api.setTicketStatus(t.id, status).subscribe({ next: (u) => (this.ticket.set(u), this.load()), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }

  protected assign(t: Ticket, assigneeId: string): void {
    this.api.assignTicket(t.id, assigneeId).subscribe({ next: (u) => (this.ticket.set(u), this.load()), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
