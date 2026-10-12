import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { ClientFormat } from '../clients/client-format';
import { DocumentsApiService } from './documents-api.service';
import { DocumentRequest } from './documents.models';

/** Tracks documents the office is still waiting for from one client, and lets staff ask for another. */
@Component({
  selector: 'app-document-requests',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, StatusBadge, HasPermissionDirective],
  template: `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <h3 class="h5 mb-0">{{ 'documents.requests.title' | translate }}</h3>
      <button *appHasPermission="'documents.upload'" type="button" class="btn btn-outline-primary btn-sm" (click)="adding.set(!adding())" [attr.aria-expanded]="adding()">
        {{ 'documents.requests.add' | translate }}
      </button>
    </div>
    @if (adding()) {
      <form class="card card-body mb-3" [formGroup]="form" (ngSubmit)="create()" novalidate [attr.aria-label]="'documents.requests.add' | translate">
        <div class="row g-3">
          <div class="col-12 col-md-7">
            <label for="rq-label" class="form-label">{{ 'documents.requests.label' | translate }} *</label>
            <input id="rq-label" class="form-control" formControlName="label" [class.is-invalid]="form.controls.label.invalid && form.controls.label.touched" />
            <app-field-error [control]="form.controls.label" />
          </div>
          <div class="col-12 col-md-5">
            <label for="rq-due" class="form-label">{{ 'documents.requests.dueDate' | translate }} *</label>
            <input id="rq-due" type="date" class="form-control" formControlName="dueDate" [class.is-invalid]="form.controls.dueDate.invalid && form.controls.dueDate.touched" />
            <app-field-error [control]="form.controls.dueDate" />
          </div>
        </div>
        @if (error(); as message) {
          <div class="alert alert-danger mt-3 mb-0" role="alert">{{ message }}</div>
        }
        <div class="d-flex gap-2 mt-3">
          <button type="submit" class="btn btn-primary">{{ 'documents.requests.send' | translate }}</button>
          <button type="button" class="btn btn-outline-secondary" (click)="adding.set(false)">{{ 'common.cancel' | translate }}</button>
        </div>
      </form>
    }
    @if (requests().length === 0) {
      <div class="alert alert-secondary" role="status">{{ 'documents.requests.empty' | translate }}</div>
    } @else {
      <ul class="list-group mb-4">
        @for (r of requests(); track r.id) {
          <li class="list-group-item d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span>
              {{ r.label }}
              <span class="text-body-secondary">({{ 'documents.requests.due' | translate }} {{ format.date(r.dueDate) }})</span>
            </span>
            <span class="d-inline-flex flex-wrap align-items-center gap-2">
              <app-status-badge [label]="'documents.requests.status.' + r.status | translate" [tone]="r.status === 'open' ? 'warning' : r.status === 'fulfilled' ? 'success' : 'secondary'" />
              @if (r.overdue) {
                <span class="badge text-bg-danger"><span aria-hidden="true">⚠ </span>{{ 'documents.requests.overdue' | translate }}</span>
              }
              @if (r.status === 'open') {
                <span *appHasPermission="'documents.upload'" class="d-inline-flex gap-1">
                  <button type="button" class="btn btn-outline-primary btn-sm" (click)="upload.emit(r.id)">
                    {{ 'documents.requests.uploadFor' | translate }}<span class="visually-hidden"> {{ r.label }}</span>
                  </button>
                  <button type="button" class="btn btn-outline-secondary btn-sm" (click)="cancel(r)">
                    {{ 'documents.requests.cancel' | translate }}<span class="visually-hidden"> {{ r.label }}</span>
                  </button>
                </span>
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
})
export class DocumentRequests {
  private readonly api = inject(DocumentsApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly format = inject(ClientFormat);

  readonly clientId = input.required<string>();
  /** Bumped by the parent after an upload so fulfilled requests refresh. */
  readonly version = input(0);
  readonly upload = output<string>();
  /** Emits the loaded requests so the upload dialog can offer the open ones. */
  readonly loaded = output<DocumentRequest[]>();

  protected readonly requests = signal<DocumentRequest[]>([]);
  protected readonly adding = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({ label: ['', Validators.required], dueDate: ['', Validators.required] });

  constructor() {
    effect(() => {
      const id = this.clientId();
      this.version();
      untracked(() => this.load(id));
    });
  }

  private load(id: string): void {
    this.api.listRequests(id).subscribe({
      next: (rows) => {
        this.requests.set(rows);
        this.loaded.emit(rows);
      },
      error: () => this.requests.set([]),
    });
  }

  protected create(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.error.set(null);
    const v = this.form.getRawValue();
    this.api.createRequest(this.clientId(), { label: v.label.trim(), dueDate: v.dueDate }).subscribe({
      next: () => {
        this.form.reset();
        this.adding.set(false);
        this.load(this.clientId());
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e)),
    });
  }

  protected cancel(request: DocumentRequest): void {
    this.api.updateRequest(request.id, 'cancelled').subscribe({ next: () => this.load(this.clientId()), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
