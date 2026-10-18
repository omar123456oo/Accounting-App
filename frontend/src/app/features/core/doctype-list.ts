import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../shared/components/field-error/field-error';
import { AuthService } from '../../core/auth/auth.service';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { CoreApiService } from './core-api.service';
import { DocTypeSummary } from './core.models';
import { FieldEditor } from './field-editor';
import { FieldRow, blankRow, rowsToFields } from './field-rows';

/** Permissions an admin-made type can be tied to. The server refuses any name it does not know. */
export const TYPE_PERMISSIONS: readonly string[] = [
  'clients.view', 'clients.update', 'documents.view', 'documents.upload', 'journals.view', 'invoices.view', 'expenses.view',
  'hr.view', 'hr.manage', 'reports.view', 'admin.settings',
];

/** Settings: list the document types, create new ones, and open the customize form or the records of each. */
@Component({
  selector: 'app-doctype-list',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, Modal, FieldError, FieldEditor, ConfirmDialog],
  template: `
    <app-page-header [title]="'core.docTypes.title' | translate">
      <button type="button" class="btn btn-primary" (click)="openNew()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'core.docTypes.new' | translate }}</button>
    </app-page-header>

    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'core.loadFailed' | translate }}</div>
    } @else if (types(); as list) {
      @if (list.length === 0) {
        <p>{{ 'core.docTypes.empty' | translate }}</p>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'core.docTypes.title' | translate }}</caption>
            <thead><tr>
              <th scope="col">{{ 'core.docTypes.label' | translate }}</th><th scope="col">{{ 'core.docTypes.name' | translate }}</th>
              <th scope="col">{{ 'core.docTypes.module' | translate }}</th><th scope="col">{{ 'core.docTypes.kind' | translate }}</th><th scope="col"></th>
            </tr></thead>
            <tbody>
              @for (t of list; track t.name) {
                <tr>
                  <td>{{ t.label }}</td>
                  <td dir="ltr"><code>{{ t.name }}</code></td>
                  <td>{{ t.module }}</td>
                  <td>{{ (t.isCustom ? 'core.docTypes.custom' : 'core.docTypes.builtin') | translate }}</td>
                  <td class="text-end text-nowrap">
                    <a class="btn btn-outline-secondary btn-sm" [routerLink]="['/app/doctypes', t.name, 'customize']">{{ 'core.docTypes.customize' | translate }}<span class="visually-hidden"> {{ t.label }}</span></a>
                    @if (t.isCustom) {
                      @if (auth.can('developer.scripts')) { <a class="btn btn-outline-secondary btn-sm ms-1" [routerLink]="['/app/doctypes', t.name, 'scripts']">{{ 'core.docTypes.scripts' | translate }}<span class="visually-hidden"> {{ t.label }}</span></a> }
                      <a class="btn btn-outline-secondary btn-sm ms-1" [routerLink]="['/app/doctypes', t.name, 'workflow']">{{ 'core.docTypes.workflow' | translate }}<span class="visually-hidden"> {{ t.label }}</span></a>
                      <a class="btn btn-outline-secondary btn-sm ms-1" [routerLink]="['/app/records', t.name]">{{ 'core.docTypes.records' | translate }}<span class="visually-hidden"> {{ t.label }}</span></a>
                      <button type="button" class="btn btn-outline-danger btn-sm ms-1" (click)="toDelete.set(t)">{{ 'common.delete' | translate }}<span class="visually-hidden"> {{ t.label }}</span></button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }

    @if (creating()) {
      <app-modal [title]="'core.docTypes.new' | translate" width="48rem" (closed)="creating.set(false)">
        <form [formGroup]="form" (ngSubmit)="create()" novalidate>
          <div class="row g-3">
            <div class="col-md-4">
              <label for="dt-name" class="form-label">{{ 'core.docTypes.name' | translate }} *</label>
              <input id="dt-name" class="form-control" dir="ltr" formControlName="name" [class.is-invalid]="form.controls.name.invalid && form.controls.name.touched" />
              <app-field-error [control]="form.controls.name" />
              <div class="form-text">{{ 'core.docTypes.nameHint' | translate }}</div>
            </div>
            <div class="col-md-4">
              <label for="dt-label" class="form-label">{{ 'core.docTypes.label' | translate }} *</label>
              <input id="dt-label" class="form-control" formControlName="label" [class.is-invalid]="form.controls.label.invalid && form.controls.label.touched" />
              <app-field-error [control]="form.controls.label" />
            </div>
            <div class="col-md-4">
              <label for="dt-module" class="form-label">{{ 'core.docTypes.module' | translate }} *</label>
              <input id="dt-module" class="form-control" dir="ltr" formControlName="module" [class.is-invalid]="form.controls.module.invalid && form.controls.module.touched" />
              <app-field-error [control]="form.controls.module" />
            </div>
            <div class="col-md-6">
              <label for="dt-view" class="form-label">{{ 'core.docTypes.viewPermission' | translate }}</label>
              <select id="dt-view" class="form-select" dir="ltr" formControlName="viewPermission">@for (p of permissions; track p) { <option [value]="p">{{ p }}</option> }</select>
            </div>
            <div class="col-md-6">
              <label for="dt-manage" class="form-label">{{ 'core.docTypes.managePermission' | translate }}</label>
              <select id="dt-manage" class="form-select" dir="ltr" formControlName="managePermission">@for (p of permissions; track p) { <option [value]="p">{{ p }}</option> }</select>
            </div>
            <div class="col-md-6">
              <label for="dt-title" class="form-label">{{ 'core.docTypes.titleField' | translate }}</label>
              <select id="dt-title" class="form-select" dir="ltr" formControlName="titleField"><option value="">{{ fieldNames()[0] ?? '' }}</option>@for (n of fieldNames().slice(1); track n) { <option [value]="n">{{ n }}</option> }</select>
            </div>
            <div class="col-md-6">
              <label for="dt-search" class="form-label">{{ 'core.docTypes.searchFields' | translate }}</label>
              <input id="dt-search" class="form-control" dir="ltr" formControlName="searchFields" />
              <div class="form-text">{{ 'core.docTypes.searchFieldsHint' | translate }}</div>
            </div>
            <div class="col-12">
              <h3 class="h6">{{ 'core.docTypes.fields' | translate }}</h3>
              <app-field-editor [(rows)]="rows" />
            </div>
          </div>
          @if (createError(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="creating.set(false)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }

    @if (toDelete(); as t) {
      <app-confirm-dialog [title]="'common.delete' | translate" [message]="'core.docTypes.deleteMessage' | translate: { name: t.label }" [confirmLabel]="'common.delete' | translate" [danger]="true" (cancelled)="toDelete.set(null)" (confirmed)="remove(t)" />
    }
    @if (actionError(); as e) { <div class="alert alert-danger mt-3" role="alert">{{ e }}</div> }
  `,
})
export class DocTypeList {
  private readonly api = inject(CoreApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly translate = inject(TranslateService);
  protected readonly auth = inject(AuthService);
  protected readonly permissions = TYPE_PERMISSIONS;

  protected readonly types = signal<DocTypeSummary[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly toDelete = signal<DocTypeSummary | null>(null);
  protected readonly rows = signal<FieldRow[]>([]);
  protected readonly fieldNames = computed(() => this.rows().map((r) => r.fieldname.trim()).filter(Boolean));

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{0,63}$/)]],
    label: ['', Validators.required],
    module: ['', Validators.required],
    viewPermission: ['clients.view'],
    managePermission: ['admin.settings'],
    titleField: [''],
    searchFields: [''],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.doctypes().subscribe({ next: (t) => this.types.set(t), error: () => this.loadFailed.set(true) });
  }

  protected openNew(): void {
    this.form.reset({ name: '', label: '', module: '', viewPermission: 'clients.view', managePermission: 'admin.settings', titleField: '', searchFields: '' });
    this.rows.set([{ ...blankRow(), fieldname: 'title', label: this.translate.instant('core.docTypes.defaultTitle') as string, required: true }]);
    this.createError.set(null);
    this.creating.set(true);
  }

  protected create(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const fields = rowsToFields(this.rows(), false);
    this.saving.set(true);
    this.createError.set(null);
    this.api
      .createDocType({
        name: v.name, label: v.label.trim(), module: v.module.trim(), fields,
        titleField: v.titleField || fields[0]?.fieldname || '',
        searchFields: v.searchFields.split(',').map((s) => s.trim()).filter(Boolean),
        viewPermission: v.viewPermission, managePermission: v.managePermission,
      })
      .subscribe({
        next: () => { this.saving.set(false); this.creating.set(false); this.load(); },
        error: (e) => { this.saving.set(false); this.createError.set(apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string)); },
      });
  }

  protected remove(t: DocTypeSummary): void {
    this.toDelete.set(null);
    this.actionError.set(null);
    this.api.deleteDocType(t.name).subscribe({
      next: () => this.load(),
      error: (e) => this.actionError.set(apiErrorMessage(e) ?? (this.translate.instant('core.saveFailed') as string)),
    });
  }
}
