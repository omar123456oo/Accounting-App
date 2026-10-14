import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { EngageApiService } from '../engage/engage-api.service';
import { APPOINTMENT_DURATIONS, Appointment } from '../engage/engage.models';
import { APPOINTMENT_TONE } from '../engage/appointments-page';

/** Ask for a meeting, see whether it is confirmed, cancel it. The office may propose another time. */
@Component({
  selector: 'app-portal-appointments',
  imports: [ReactiveFormsModule, TranslatePipe, StatusBadge, Modal, FieldError],
  template: `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="h3 mb-0">{{ 'portal.tabs.appointments' | translate }}</h1>
      <button type="button" class="btn btn-primary" (click)="openNew()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'portal.appointments.request' | translate }}</button>
    </div>
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    }
    <ul class="list-group">
      @for (a of rows(); track a.id) {
        <li class="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <div class="fw-semibold">{{ a.topic }}</div>
            <div class="small text-body-secondary" dir="ltr">{{ format.date(a.startsAt.slice(0, 10)) }} {{ a.startsAt.slice(11) }} · {{ a.durationMin }} {{ 'appointments.min' | translate }}@if (a.staffName) { · {{ a.staffName }} }</div>
            @if (a.note) {
              <div class="small">{{ a.note }}</div>
            }
          </div>
          <div class="d-flex align-items-center gap-2">
            <app-status-badge [label]="'appointments.statuses.' + a.status | translate" [tone]="tone[a.status]" />
            @if (a.status === 'requested' || a.status === 'confirmed') {
              <button type="button" class="btn btn-outline-secondary btn-sm" (click)="cancel(a)">{{ 'hr.leave.cancel' | translate }}</button>
            }
          </div>
        </li>
      } @empty {
        <li class="list-group-item text-body-secondary">{{ 'portal.appointments.none' | translate }}</li>
      }
    </ul>

    @if (creating()) {
      <app-modal [title]="'portal.appointments.request' | translate" (closed)="creating.set(false)">
        <form [formGroup]="form" (ngSubmit)="create()" novalidate>
          <div class="mb-3">
            <label for="rq-topic" class="form-label">{{ 'appointments.topic' | translate }} *</label>
            <input id="rq-topic" class="form-control" formControlName="topic" [class.is-invalid]="form.controls.topic.invalid && form.controls.topic.touched" />
            <app-field-error [control]="form.controls.topic" />
          </div>
          <div class="row g-3 mb-3">
            <div class="col-7">
              <label for="rq-when" class="form-label">{{ 'appointments.when' | translate }} *</label>
              <input id="rq-when" type="datetime-local" class="form-control" dir="ltr" formControlName="startsAt" [class.is-invalid]="form.controls.startsAt.invalid && form.controls.startsAt.touched" />
              <app-field-error [control]="form.controls.startsAt" />
            </div>
            <div class="col-5">
              <label for="rq-dur" class="form-label">{{ 'portal.appointments.duration' | translate }}</label>
              <select id="rq-dur" class="form-select" formControlName="durationMin">
                @for (d of durations; track d) {
                  <option [ngValue]="d">{{ d }} {{ 'appointments.min' | translate }}</option>
                }
              </select>
            </div>
          </div>
          @if (formError(); as e) {
            <div class="alert alert-danger" role="alert">{{ e }}</div>
          }
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" (click)="creating.set(false)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary">{{ 'portal.appointments.send' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class PortalAppointments {
  private readonly api = inject(EngageApiService);
  protected readonly format = inject(ClientFormat);
  protected readonly tone = APPOINTMENT_TONE;
  protected readonly durations = APPOINTMENT_DURATIONS;
  protected readonly rows = signal<Appointment[]>([]);
  protected readonly failed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    topic: ['', Validators.required],
    startsAt: ['', Validators.required],
    durationMin: [60 as number],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.appointments('portal').subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }

  protected openNew(): void {
    this.form.reset({ topic: '', startsAt: '', durationMin: 60 });
    this.formError.set(null);
    this.creating.set(true);
  }

  protected create(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.api.requestAppointment(this.form.getRawValue()).subscribe({
      next: () => {
        this.creating.set(false);
        this.load();
      },
      error: (e: unknown) => {
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.formError.set(Object.keys(fieldErrors(e)).length ? null : apiErrorMessage(e));
      },
    });
  }

  protected cancel(a: Appointment): void {
    this.error.set(null);
    this.api.cancelAppointment(a.id).subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
