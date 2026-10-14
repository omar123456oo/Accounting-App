import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, of, switchMap } from 'rxjs';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { CoreApiService } from './core-api.service';
import { DocRecordView, DocTypeMeta } from './core.models';
import { buildGroup, toPayload, visibleFields } from './record-form-model';

/** One record of an admin-made document type, drawn from the type's current field list (built-in plus custom fields). */
@Component({
  selector: 'app-record-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, ConfirmDialog],
  template: `
    <app-page-header [title]="record() ? record()!.title : meta() ? (('core.record.newTitle' | translate: { label: meta()!.label })) : ('common.loading' | translate)">
      <a class="btn btn-outline-secondary" [routerLink]="['/app/records', type]">{{ 'core.record.back' | translate }}</a>
      @if (record() && meta()?.canManage) {
        <button type="button" class="btn btn-outline-danger" (click)="confirmDelete.set(true)">{{ 'common.delete' | translate }}</button>
      }
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.records.notFound' | translate }}</div>
    } @else if (form(); as f) {
      <form [formGroup]="f" (ngSubmit)="save()" novalidate class="card"><div class="card-body">
        @if (record(); as r) { <p class="text-body-secondary small" dir="ltr">{{ r.name }}</p> }
        <div class="row g-3">
          @for (fd of fields(); track fd.fieldname) {
            <div class="col-md-6">
              @if (fd.fieldtype === 'checkbox') {
                <div class="form-check mt-4">
                  <input type="checkbox" class="form-check-input" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" />
                  <label class="form-check-label" [for]="'f-' + fd.fieldname">{{ fd.label }}</label>
                </div>
              } @else {
                <label class="form-label" [for]="'f-' + fd.fieldname">{{ fd.label }}@if (fd.required) { <span aria-hidden="true"> *</span> }</label>
                @switch (fd.fieldtype) {
                  @case ('select') {
                    <select class="form-select" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)">
                      <option value=""></option>
                      @for (o of fd.options ?? []; track o) { <option [value]="o">{{ o }}</option> }
                    </select>
                  }
                  @case ('date') { <input type="date" class="form-control" dir="ltr" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" /> }
                  @case ('number') { <input type="number" class="form-control" dir="ltr" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" /> }
                  @case ('currency') { <input type="number" step="0.01" class="form-control" dir="ltr" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" /> }
                  @default { <input type="text" class="form-control" [id]="'f-' + fd.fieldname" [formControlName]="fd.fieldname" [class.is-invalid]="invalid(fd.fieldname)" [attr.dir]="fd.fieldtype === 'link' ? 'ltr' : null" /> }
                }
                @if (serverErrors()[fd.fieldname]; as e) { <div class="invalid-feedback d-block" role="alert">{{ e }}</div> }
                @else if (invalid(fd.fieldname)) { <div class="invalid-feedback d-block" role="alert">{{ 'validation.required' | translate }}</div> }
              }
            </div>
          }
        </div>
        @if (error(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }
        @if (meta()?.canManage) {
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
          </div>
        } @else {
          <p class="text-body-secondary small mt-3 mb-0">{{ 'core.record.readOnly' | translate }}</p>
        }
      </div></form>
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }

    @if (confirmDelete()) {
      <app-confirm-dialog [title]="'common.delete' | translate" [message]="'core.record.deleteMessage' | translate: { name: record()!.name }" [confirmLabel]="'common.delete' | translate" [danger]="true" (cancelled)="confirmDelete.set(false)" (confirmed)="remove()" />
    }
  `,
})
export class RecordForm {
  private readonly api = inject(CoreApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  protected type = '';

  protected readonly meta = signal<DocTypeMeta | null>(null);
  protected readonly record = signal<DocRecordView | null>(null);
  protected readonly form = signal<ReturnType<typeof buildGroup> | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly confirmDelete = signal(false);
  protected readonly fields = computed(() => visibleFields(this.meta()?.fields ?? []));

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((p) => {
          this.type = p.get('doctype') ?? '';
          const name = p.get('name');
          return forkJoin({ meta: this.api.meta(this.type), record: name && name !== 'new' ? this.api.record(this.type, name) : of(null) });
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ meta, record }) => {
          this.meta.set(meta);
          this.record.set(record);
          const group = buildGroup(meta.fields, record?.data ?? {});
          if (!meta.canManage) group.disable();
          this.form.set(group);
        },
        error: () => this.loadFailed.set(true),
      });
  }

  protected invalid(name: string): boolean {
    const c = this.form()?.controls[name];
    return !!c && c.invalid && (c.touched || this.form()!.dirty);
  }

  protected save(): void {
    const f = this.form();
    const meta = this.meta();
    if (!f || !meta) return;
    f.markAllAsTouched();
    if (f.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    this.serverErrors.set({});
    const payload = toPayload(meta.fields, f.getRawValue());
    const existing = this.record();
    const call = existing ? this.api.updateRecord(this.type, existing.name, payload) : this.api.createRecord(this.type, payload);
    call.subscribe({
      next: (r) => {
        this.saving.set(false);
        this.record.set(r);
        void this.router.navigate(['/app/records', this.type, r.name]);
      },
      error: (e) => {
        this.saving.set(false);
        const byField = Object.fromEntries(Object.entries(fieldErrors(e)).map(([k, v]) => [k.replace(/^data\./, ''), v]));
        this.serverErrors.set(byField);
        this.error.set(Object.keys(byField).length ? null : (apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string)));
      },
    });
  }

  protected remove(): void {
    const r = this.record();
    this.confirmDelete.set(false);
    if (!r) return;
    this.api.deleteRecord(this.type, r.name).subscribe({
      next: () => void this.router.navigate(['/app/records', this.type]),
      error: (e) => this.error.set(apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string)),
    });
  }
}
