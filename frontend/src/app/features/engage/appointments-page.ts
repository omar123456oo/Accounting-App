import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { BadgeTone, StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { EngageApiService } from './engage-api.service';
import { ChartCard, ChartItem, PieChart } from '../analytics/analytics-charts';
import { APPOINTMENT_STATUSES, Appointment, AppointmentStatus } from './engage.models';

export const APPOINTMENT_TONE: Record<AppointmentStatus, BadgeTone> = { requested: 'warning', confirmed: 'success', declined: 'danger', cancelled: 'secondary', completed: 'info' };

/** Client appointment requests and the office's calendar: confirm (or propose another time), decline with a reason, complete. */
@Component({
  selector: 'app-appointments-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, CommentDialog, Modal, ChartCard, PieChart],
  template: `
    <app-page-header [title]="'appointments.title' | translate" />
    <div class="row g-3 mb-3">
      <div class="col-md-6"><app-chart-card [title]="'analytics.support.appointmentsByStatus' | translate"><app-pie-chart [items]="byStatus()" [label]="'analytics.support.appointmentsByStatus' | translate" [empty]="'appointments.none' | translate" /></app-chart-card></div>
      <div class="col-md-6"><app-chart-card [title]="'appointments.byDuration' | translate"><app-pie-chart [items]="byDuration()" [label]="'appointments.byDuration' | translate" [empty]="'appointments.none' | translate" /></app-chart-card></div>
    </div>
    <div class="mb-3">
      <label for="ap-status" class="visually-hidden">{{ 'tickets.status' | translate }}</label>
      <select id="ap-status" class="form-select w-auto" [value]="status()" (change)="status.set($any($event.target).value); load()">
        <option value="">{{ 'tickets.anyStatus' | translate }}</option>
        @for (s of statuses; track s) {
          <option [value]="s">{{ 'appointments.statuses.' + s | translate }}</option>
        }
      </select>
    </div>
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }
    <div class="table-responsive">
      <table class="table align-middle">
        <caption class="visually-hidden">{{ 'appointments.title' | translate }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'appointments.when' | translate }}</th>
            <th scope="col">{{ 'appointments.client' | translate }}</th>
            <th scope="col">{{ 'appointments.topic' | translate }}</th>
            <th scope="col">{{ 'tickets.status' | translate }}</th>
            <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
          </tr>
        </thead>
        <tbody>
          @for (a of rows(); track a.id) {
            <tr>
              <td class="text-nowrap" dir="ltr">{{ when(a) }}<div class="small text-body-secondary">{{ a.durationMin }} {{ 'appointments.min' | translate }}</div></td>
              <td>{{ a.clientName }}<div class="small text-body-secondary">{{ a.requestedByName }}</div></td>
              <td>{{ a.topic }}@if (a.note) { <div class="small text-body-secondary">{{ a.note }}</div> }@if (a.staffName) { <div class="small text-body-secondary">{{ a.staffName }}</div> }</td>
              <td><app-status-badge [label]="'appointments.statuses.' + a.status | translate" [tone]="tone[a.status]" /></td>
              <td class="text-end text-nowrap">
                @if (a.status === 'requested') {
                  <button type="button" class="btn btn-success btn-sm me-1" (click)="confirming.set(a); newTime.set(a.startsAt)">{{ 'appointments.confirm' | translate }}</button>
                  <button type="button" class="btn btn-outline-danger btn-sm" (click)="declining.set(a)">{{ 'appointments.decline' | translate }}</button>
                } @else if (a.status === 'confirmed') {
                  <button type="button" class="btn btn-outline-secondary btn-sm me-1" (click)="confirming.set(a); newTime.set(a.startsAt)">{{ 'appointments.reschedule' | translate }}</button>
                  <button type="button" class="btn btn-outline-primary btn-sm" (click)="complete(a)">{{ 'appointments.complete' | translate }}</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="text-center text-body-secondary py-4">{{ 'appointments.none' | translate }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (confirming(); as a) {
      <app-modal [title]="'appointments.confirm' | translate" (closed)="confirming.set(null)">
        <form (submit)="$event.preventDefault(); confirm(a)">
          <label for="ap-time" class="form-label">{{ 'appointments.when' | translate }}</label>
          <input id="ap-time" type="datetime-local" class="form-control" dir="ltr" [value]="newTime()" (input)="newTime.set($any($event.target).value)" [class.is-invalid]="!!timeError()" />
          @if (timeError(); as t) {
            <div class="invalid-feedback d-block" role="alert">{{ t }}</div>
          }
          <div class="form-text">{{ 'appointments.timeHint' | translate }}</div>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="confirming.set(null)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary">{{ 'appointments.confirm' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
    @if (declining(); as a) {
      <app-comment-dialog [title]="'appointments.decline' | translate" [label]="'appointments.reason' | translate" [confirmLabel]="'appointments.decline' | translate" [required]="true" [danger]="true" (confirmed)="decline(a, $event)" (cancelled)="declining.set(null)" />
    }
  `,
})
export class AppointmentsPage {
  private readonly api = inject(EngageApiService);
  private readonly format = inject(ClientFormat);
  protected readonly statuses = APPOINTMENT_STATUSES;
  protected readonly tone = APPOINTMENT_TONE;
  protected readonly rows = signal<Appointment[]>([]);
  private readonly all = signal<Appointment[]>([]);
  protected readonly byStatus = computed(() => APPOINTMENT_STATUSES.map((s): ChartItem => ({ label: '', labelKey: 'appointments.statuses.' + s, value: this.all().filter((a) => a.status === s).length, tone: APPOINTMENT_TONE[s] })));
  protected readonly byDuration = computed(() => [...new Set(this.all().map((a) => a.durationMin))].sort((a, b) => a - b).map((d): ChartItem => ({ label: `${d} min`, value: this.all().filter((a) => a.durationMin === d).length })));
  protected readonly status = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly confirming = signal<Appointment | null>(null);
  protected readonly declining = signal<Appointment | null>(null);
  protected readonly newTime = signal('');
  protected readonly timeError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.api.appointments('staff').subscribe({ next: (r) => this.all.set(r), error: () => undefined });
    this.api.appointments('staff', this.status()).subscribe({ next: (r) => this.rows.set(r), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }

  protected when(a: Appointment): string {
    return `${this.format.date(a.startsAt.slice(0, 10))} ${a.startsAt.slice(11)}`;
  }

  protected confirm(a: Appointment): void {
    this.timeError.set(null);
    this.api.decideAppointment(a.id, 'confirm', { startsAt: this.newTime() }).subscribe({
      next: () => {
        this.confirming.set(null);
        this.load();
      },
      error: (e: unknown) => this.timeError.set(fieldErrors(e)['startsAt'] ?? apiErrorMessage(e)),
    });
  }

  protected decline(a: Appointment, note: string): void {
    this.declining.set(null);
    this.api.decideAppointment(a.id, 'decline', { note }).subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }

  protected complete(a: Appointment): void {
    this.api.decideAppointment(a.id, 'complete').subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
