import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { BadgeTone, StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { ClientsApiService } from '../clients/clients-api.service';
import { addDaysIso } from '../analytics/analytics.helpers';
import { EngageApiService } from './engage-api.service';
import { EntryStatus, PendingWeek, TimeEntry } from './engage.models';

const TONE: Record<EntryStatus, BadgeTone> = { draft: 'secondary', submitted: 'warning', approved: 'success', rejected: 'danger' };

/** Sunday of the week containing a business date (Egypt's working week runs Sunday to Thursday). */
export function weekStartOfDate(date: string): string {
  return addDaysIso(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}

export function hoursText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Log time against clients, review the week, send it for approval. Approvers also see the weeks waiting for them. */
@Component({
  selector: 'app-timesheets-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, StatusBadge, Modal, FieldError, CommentDialog],
  template: `
    <app-page-header [title]="'timesheets.title' | translate">
      <button type="button" class="btn btn-primary" (click)="openEntry(null, today)"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'timesheets.add' | translate }}</button>
    </app-page-header>

    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <button type="button" class="btn btn-outline-secondary btn-sm" [attr.aria-label]="'timesheets.prev' | translate" (click)="move(-7)"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
      <strong>{{ format.date(weekStart()) }} — {{ format.date(weekEnd()) }}</strong>
      <button type="button" class="btn btn-outline-secondary btn-sm" [attr.aria-label]="'timesheets.next' | translate" (click)="move(7)"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      <button type="button" class="btn btn-link btn-sm" (click)="weekStart.set(thisWeek); load()">{{ 'timesheets.thisWeek' | translate }}</button>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-6 col-md-3"><div class="card"><div class="card-body"><div class="small text-body-secondary">{{ 'timesheets.total' | translate }}</div><div class="fs-4 fw-bold" dir="ltr">{{ hours(total()) }}</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card"><div class="card-body"><div class="small text-body-secondary">{{ 'timesheets.billable' | translate }}</div><div class="fs-4 fw-bold text-success" dir="ltr">{{ hours(billable()) }}</div></div></div></div>
      <div class="col-6 col-md-3"><div class="card"><div class="card-body"><div class="small text-body-secondary">{{ 'timesheets.utilisation' | translate }}</div><div class="fs-4 fw-bold" dir="ltr">{{ total() ? Math.round((billable() / total()) * 100) + '%' : '—' }}</div></div></div></div>
      <div class="col-6 col-md-3 d-flex align-items-center">
        <button type="button" class="btn btn-success w-100" [disabled]="!submittable() || busy()" (click)="submit()"><i class="fa-solid fa-paper-plane me-1" aria-hidden="true"></i>{{ 'timesheets.submit' | translate }}</button>
      </div>
    </div>

    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }

    <div class="table-responsive mb-4">
      <table class="table align-middle">
        <caption class="visually-hidden">{{ 'timesheets.title' | translate }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'timesheets.day' | translate }}</th>
            <th scope="col">{{ 'timesheets.client' | translate }}</th>
            <th scope="col">{{ 'timesheets.note' | translate }}</th>
            <th scope="col" class="text-end">{{ 'timesheets.hours' | translate }}</th>
            <th scope="col">{{ 'tickets.status' | translate }}</th>
            <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
          </tr>
        </thead>
        <tbody>
          @for (d of days(); track d.date) {
            @for (e of d.entries; track e.id; let first = $first) {
              <tr>
                <td>@if (first) { {{ format.date(d.date) }} }</td>
                <td>{{ e.clientName ?? '—' }}@if (e.billable) { <i class="fa-solid fa-dollar-sign text-success ms-1" [attr.title]="'timesheets.billable' | translate"></i> }</td>
                <td>{{ e.note }}@if (e.decisionNote) { <div class="small text-danger">{{ e.decidedBy }}: {{ e.decisionNote }}</div> }</td>
                <td class="text-end" dir="ltr">{{ hours(e.minutes) }}</td>
                <td><app-status-badge [label]="'timesheets.statuses.' + e.status | translate" [tone]="tone[e.status]" /></td>
                <td class="text-end text-nowrap">
                  @if (e.status === 'draft' || e.status === 'rejected') {
                    <button type="button" class="btn btn-outline-secondary btn-sm me-1" (click)="openEntry(e, e.date)">{{ 'common.edit' | translate }}</button>
                    <button type="button" class="btn btn-outline-danger btn-sm" [attr.aria-label]="'common.delete' | translate" (click)="remove(e)"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                  }
                </td>
              </tr>
            } @empty {
              <tr class="text-body-secondary"><td>{{ format.date(d.date) }}</td><td colspan="5">—</td></tr>
            }
          }
        </tbody>
      </table>
    </div>

    @if (auth.can('timesheets.approve')) {
      <h2 class="h5">{{ 'timesheets.approvals' | translate }}</h2>
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ 'timesheets.approvals' | translate }}</caption>
          <thead><tr><th scope="col">{{ 'timesheets.person' | translate }}</th><th scope="col">{{ 'timesheets.week' | translate }}</th><th scope="col" class="text-end">{{ 'timesheets.total' | translate }}</th><th scope="col" class="text-end">{{ 'timesheets.billable' | translate }}</th><th scope="col"></th></tr></thead>
          <tbody>
            @for (p of pending(); track p.userId + p.weekStart) {
              <tr>
                <td>{{ p.userName }}</td>
                <td>{{ format.date(p.weekStart) }}</td>
                <td class="text-end" dir="ltr">{{ hours(p.minutes) }}</td>
                <td class="text-end" dir="ltr">{{ hours(p.billableMinutes) }}</td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-success btn-sm me-1" (click)="decide(p, 'approve', '')">{{ 'hr.leave.approve' | translate }}</button>
                  <button type="button" class="btn btn-outline-danger btn-sm" (click)="rejecting.set(p)">{{ 'hr.leave.reject' | translate }}</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="text-center text-body-secondary py-3">{{ 'timesheets.nothingPending' | translate }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    @if (editing() !== undefined) {
      <app-modal [title]="(editing() ? 'common.edit' : 'timesheets.add') | translate" (closed)="editing.set(undefined)">
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="row g-3">
            <div class="col-6">
              <label for="te-date" class="form-label">{{ 'timesheets.day' | translate }} *</label>
              <input id="te-date" type="date" class="form-control" dir="ltr" formControlName="date" [max]="today" [class.is-invalid]="form.controls.date.invalid && form.controls.date.touched" />
              <app-field-error [control]="form.controls.date" />
            </div>
            <div class="col-6">
              <label for="te-min" class="form-label">{{ 'timesheets.minutes' | translate }} *</label>
              <input id="te-min" type="number" min="5" max="1440" step="5" class="form-control" dir="ltr" formControlName="minutes" [class.is-invalid]="form.controls.minutes.invalid && form.controls.minutes.touched" />
              <app-field-error [control]="form.controls.minutes" />
            </div>
            <div class="col-12">
              <label for="te-client" class="form-label">{{ 'timesheets.client' | translate }}</label>
              <select id="te-client" class="form-select" formControlName="clientId" [class.is-invalid]="form.controls.clientId.invalid && form.controls.clientId.touched">
                <option value="">—</option>
                @for (c of clients(); track c.id) {
                  <option [value]="c.id">{{ c.legalName }}</option>
                }
              </select>
              <app-field-error [control]="form.controls.clientId" />
            </div>
            <div class="col-12">
              <label for="te-note" class="form-label">{{ 'timesheets.note' | translate }} *</label>
              <input id="te-note" class="form-control" formControlName="note" [class.is-invalid]="form.controls.note.invalid && form.controls.note.touched" />
              <app-field-error [control]="form.controls.note" />
            </div>
            <div class="col-12 form-check ms-2">
              <input id="te-bill" type="checkbox" class="form-check-input" formControlName="billable" />
              <label for="te-bill" class="form-check-label">{{ 'timesheets.billableHint' | translate }}</label>
            </div>
          </div>
          @if (formError(); as e) {
            <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
          }
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="editing.set(undefined)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
    @if (rejecting(); as p) {
      <app-comment-dialog [title]="'hr.leave.reject' | translate" [label]="'hr.leave.note' | translate" [confirmLabel]="'hr.leave.reject' | translate" [required]="true" [danger]="true" (confirmed)="decide(p, 'reject', $event)" (cancelled)="rejecting.set(null)" />
    }
  `,
})
export class TimesheetsPage {
  private readonly api = inject(EngageApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly auth = inject(AuthService);
  protected readonly format = inject(ClientFormat);
  protected readonly Math = Math;
  protected readonly tone = TONE;
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly thisWeek = weekStartOfDate(this.today);
  protected readonly weekStart = signal(this.thisWeek);
  protected readonly entries = signal<TimeEntry[]>([]);
  protected readonly pending = signal<PendingWeek[]>([]);
  protected readonly clients = signal<Array<{ id: string; legalName: string }>>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly editing = signal<TimeEntry | null | undefined>(undefined);
  protected readonly rejecting = signal<PendingWeek | null>(null);

  protected readonly weekEnd = computed(() => addDaysIso(this.weekStart(), 6));
  protected readonly total = computed(() => this.entries().reduce((n, e) => n + e.minutes, 0));
  protected readonly billable = computed(() => this.entries().filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0));
  protected readonly submittable = computed(() => this.entries().some((e) => e.status === 'draft' || e.status === 'rejected'));
  protected readonly days = computed(() =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDaysIso(this.weekStart(), i);
      return { date, entries: this.entries().filter((e) => e.date === date) };
    }),
  );

  protected readonly form = this.fb.group({
    date: ['', Validators.required],
    minutes: [60, [Validators.required, Validators.min(5), Validators.max(1440)]],
    clientId: [''],
    note: ['', Validators.required],
    billable: [true],
  });

  constructor() {
    inject(ClientsApiService)
      .list({ page: 1, pageSize: 100 })
      .pipe(catchError(() => of({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })))
      .subscribe((p) => this.clients.set(p.data.filter((c) => c.status !== 'closed')));
    this.load();
  }

  protected hours = hoursText;

  protected load(): void {
    this.error.set(null);
    this.api.entries(this.weekStart(), this.weekEnd()).subscribe({ next: (r) => this.entries.set(r), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
    if (this.auth.can('timesheets.approve')) this.api.pendingWeeks().subscribe((r) => this.pending.set(r));
  }

  protected move(days: number): void {
    this.weekStart.set(addDaysIso(this.weekStart(), days));
    this.load();
  }

  protected openEntry(e: TimeEntry | null, date: string): void {
    this.formError.set(null);
    this.form.reset(e ? { date: e.date, minutes: e.minutes, clientId: e.clientId ?? '', note: e.note, billable: e.billable } : { date: date > this.today ? this.today : date, minutes: 60, clientId: '', note: '', billable: true });
    this.editing.set(e);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.formError.set(null);
    this.api.saveEntry({ date: v.date, minutes: Number(v.minutes), note: v.note, billable: v.billable, ...(v.clientId ? { clientId: v.clientId } : {}) }, this.editing()?.id).subscribe({
      next: (saved) => {
        this.editing.set(undefined);
        this.weekStart.set(saved.weekStart);
        this.load();
      },
      error: (e: unknown) => {
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.formError.set(Object.keys(fieldErrors(e)).length ? null : apiErrorMessage(e));
      },
    });
  }

  protected remove(e: TimeEntry): void {
    this.api.deleteEntry(e.id).subscribe({ next: () => this.load(), error: (err: unknown) => this.error.set(apiErrorMessage(err)) });
  }

  protected submit(): void {
    this.busy.set(true);
    this.api.submitWeek(this.weekStart()).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected decide(p: PendingWeek, action: 'approve' | 'reject', note: string): void {
    this.rejecting.set(null);
    this.api.decideWeek(p.userId, p.weekStart, action, note).subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
