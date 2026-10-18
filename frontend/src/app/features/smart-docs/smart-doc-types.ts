import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { SmartDocsApi } from './smart-docs-api.service';
import { DocField, DocTypeDef, FIELD_ROLES, FIELD_TYPES } from './smart-docs.models';

const KEY = /^[a-z][a-z0-9_]{0,47}$/;

/** Administrators decide what a document type looks like: its fields, which are required or sensitive, and what each field means to reminders. */
@Component({
  selector: 'app-smart-doc-types',
  imports: [FormsModule, TranslatePipe, PageHeader, Modal],
  template: `
    <app-page-header [title]="'smartDocs.types.title' | translate">
      <button type="button" class="btn btn-primary" (click)="startNew()">{{ 'smartDocs.types.new' | translate }}</button>
    </app-page-header>
    @if (error(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
    @if (message(); as m) { <div class="alert alert-success" role="status">{{ m }}</div> }

    <div class="row g-4">
      <div class="col-lg-3">
        <div class="list-group" role="list">
          @for (t of types(); track t.key) {
            <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" role="listitem" [class.active]="edit()?.key === t.key" (click)="open(t)">
              <span>{{ t.label }}</span>@if (!t.active) { <span class="badge text-bg-secondary">{{ 'smartDocs.types.inactive' | translate }}</span> }
            </button>
          } @empty { <p class="text-body-secondary">{{ 'common.loading' | translate }}</p> }
        </div>
      </div>

      <div class="col-lg-9">
        @if (edit(); as t) {
          <form (ngSubmit)="saveType()" class="row g-2 mb-4" novalidate>
            <div class="col-md-5"><label class="form-label" for="ty-label">{{ 'smartDocs.types.label' | translate }}</label><input id="ty-label" name="label" class="form-control" [(ngModel)]="t.label" /></div>
            <div class="col-md-4"><label class="form-label" for="ty-labelAr">{{ 'smartDocs.types.labelAr' | translate }}</label><input id="ty-labelAr" name="labelAr" dir="rtl" class="form-control" [(ngModel)]="labelAr" /></div>
            <div class="col-md-3"><label class="form-label" for="ty-days">{{ 'smartDocs.types.soonDays' | translate }}</label><input id="ty-days" name="days" type="number" min="0" class="form-control" [(ngModel)]="t.expiringSoonDays" /></div>
            <div class="col-md-9"><label class="form-label" for="ty-kw">{{ 'smartDocs.types.keywords' | translate }}</label><input id="ty-kw" name="kw" class="form-control" [(ngModel)]="keywords" /><div class="form-text">{{ 'smartDocs.types.keywordsHint' | translate }}</div></div>
            <div class="col-md-3 d-flex align-items-end gap-3"><div class="form-check"><input id="ty-act" name="act" type="checkbox" class="form-check-input" [(ngModel)]="t.active" /><label class="form-check-label" for="ty-act">{{ 'smartDocs.rules.active' | translate }}</label></div><button type="submit" class="btn btn-outline-primary">{{ 'common.save' | translate }}</button></div>
          </form>

          <h2 class="h5">{{ 'smartDocs.types.fields' | translate }}</h2>
          <p class="text-body-secondary small">{{ 'smartDocs.types.fieldsHint' | translate }}</p>
          <div class="table-responsive"><table class="table table-sm align-middle">
            <caption class="visually-hidden">{{ 'smartDocs.types.fields' | translate }}</caption>
            <thead><tr><th scope="col">{{ 'smartDocs.types.key' | translate }}</th><th scope="col">{{ 'smartDocs.types.fieldLabel' | translate }}</th><th scope="col">{{ 'smartDocs.types.fieldType' | translate }}</th><th scope="col">{{ 'smartDocs.types.role' | translate }}</th><th scope="col">{{ 'smartDocs.types.required' | translate }}</th><th scope="col">{{ 'smartDocs.fields.sensitive' | translate }}</th><th scope="col">{{ 'smartDocs.rules.active' | translate }}</th><th scope="col"></th></tr></thead>
            <tbody>
              @for (f of fields(); track f.key; let i = $index) {
                <tr [class.text-body-secondary]="!f.active">
                  <td dir="ltr"><code>{{ f.key }}</code></td>
                  <td><label class="visually-hidden" [for]="'fl-' + i">{{ 'smartDocs.types.fieldLabel' | translate }} {{ f.key }}</label><input [id]="'fl-' + i" class="form-control form-control-sm" [ngModel]="f.label" [name]="'fl' + i" (ngModelChange)="upd(i, { label: $event })" />
                    @if (f.type === 'select') { <label class="visually-hidden" [for]="'fo-' + i">{{ 'smartDocs.types.options' | translate }}</label><input [id]="'fo-' + i" class="form-control form-control-sm mt-1" [placeholder]="'smartDocs.types.options' | translate" [ngModel]="f.options.join(', ')" [name]="'fo' + i" (ngModelChange)="upd(i, { options: splitList($event) })" /> }
                    @if (f.type === 'reference') { <label class="visually-hidden" [for]="'fr-' + i">{{ 'smartDocs.types.refKind' | translate }}</label><select [id]="'fr-' + i" class="form-select form-select-sm mt-1" [ngModel]="f.referenceKind" [name]="'fr' + i" (ngModelChange)="upd(i, { referenceKind: $event })"><option value="employee">employee</option><option value="department">department</option><option value="user">user</option></select> }</td>
                  <td><label class="visually-hidden" [for]="'ft-' + i">{{ 'smartDocs.types.fieldType' | translate }} {{ f.key }}</label><select [id]="'ft-' + i" class="form-select form-select-sm" [ngModel]="f.type" [name]="'ft' + i" (ngModelChange)="upd(i, { type: $event })">@for (x of fieldTypes; track x) { <option [value]="x">{{ 'smartDocs.fieldType.' + x | translate }}</option> }</select></td>
                  <td><label class="visually-hidden" [for]="'fm-' + i">{{ 'smartDocs.types.role' | translate }} {{ f.key }}</label><select [id]="'fm-' + i" class="form-select form-select-sm" [ngModel]="f.role" [name]="'fm' + i" (ngModelChange)="upd(i, { role: $event || null })"><option [ngValue]="null"></option>@for (r of roles; track r) { <option [value]="r">{{ 'smartDocs.roles.' + r | translate }}</option> }</select></td>
                  <td><input type="checkbox" class="form-check-input" [checked]="f.required" (change)="upd(i, { required: $any($event.target).checked })" [attr.aria-label]="('smartDocs.types.required' | translate) + ' ' + f.key" /></td>
                  <td><input type="checkbox" class="form-check-input" [checked]="f.sensitive" (change)="upd(i, { sensitive: $any($event.target).checked })" [attr.aria-label]="('smartDocs.fields.sensitive' | translate) + ' ' + f.key" /></td>
                  <td><input type="checkbox" class="form-check-input" [checked]="f.active" (change)="upd(i, { active: $any($event.target).checked })" [attr.aria-label]="('smartDocs.rules.active' | translate) + ' ' + f.key" /></td>
                  <td class="text-nowrap">
                    <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="i === 0" (click)="move(i, -1)" [attr.aria-label]="('smartDocs.types.up' | translate) + ' ' + f.key"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="i === fields().length - 1" (click)="move(i, 1)" [attr.aria-label]="('smartDocs.types.down' | translate) + ' ' + f.key"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>
                  </td>
                </tr>
                @if (fieldErrors()['fields.' + i + '.key'] || fieldErrors()['fields.' + i + '.role'] || fieldErrors()['fields.' + i + '.options'] || fieldErrors()['fields.' + i + '.label']) {
                  <tr><td colspan="8" class="text-danger small" role="alert">{{ fieldErrors()['fields.' + i + '.key'] || fieldErrors()['fields.' + i + '.role'] || fieldErrors()['fields.' + i + '.options'] || fieldErrors()['fields.' + i + '.label'] }}</td></tr>
                }
              }
            </tbody>
          </table></div>
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-3"><label class="form-label" for="nf-key">{{ 'smartDocs.types.key' | translate }}</label><input id="nf-key" name="nfkey" dir="ltr" class="form-control form-control-sm" [(ngModel)]="newKey" /></div>
            <div class="col-md-4"><label class="form-label" for="nf-label">{{ 'smartDocs.types.fieldLabel' | translate }}</label><input id="nf-label" name="nflabel" class="form-control form-control-sm" [(ngModel)]="newLabel" /></div>
            <div class="col-md-3"><label class="form-label" for="nf-type">{{ 'smartDocs.types.fieldType' | translate }}</label><select id="nf-type" name="nftype" class="form-select form-select-sm" [(ngModel)]="newType">@for (x of fieldTypes; track x) { <option [value]="x">{{ 'smartDocs.fieldType.' + x | translate }}</option> }</select></div>
            <div class="col-md-2"><button type="button" class="btn btn-outline-secondary btn-sm w-100" (click)="addField()">{{ 'smartDocs.types.addField' | translate }}</button></div>
          </div>
          @if (fieldError(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
          <button type="button" class="btn btn-primary" (click)="saveFields()">{{ 'smartDocs.types.saveFields' | translate }}</button>
        } @else { <p class="text-body-secondary">{{ 'smartDocs.types.pick' | translate }}</p> }
      </div>
    </div>

    @if (creating()) {
      <app-modal [title]="'smartDocs.types.new' | translate" (closed)="creating.set(false)">
        <form (ngSubmit)="create()" novalidate>
          <div class="mb-3"><label class="form-label" for="nt-key">{{ 'smartDocs.types.key' | translate }}</label><input id="nt-key" name="key" dir="ltr" class="form-control" [(ngModel)]="createKey" /><div class="form-text">{{ 'smartDocs.types.keyHint' | translate }}</div></div>
          <div class="mb-3"><label class="form-label" for="nt-label">{{ 'smartDocs.types.label' | translate }}</label><input id="nt-label" name="label" class="form-control" [(ngModel)]="createLabel" /></div>
          @if (createError(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
          <div class="d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="creating.set(false)">{{ 'common.cancel' | translate }}</button><button type="submit" class="btn btn-primary">{{ 'common.save' | translate }}</button></div>
        </form>
      </app-modal>
    }
  `,
})
export class SmartDocTypes {
  private readonly api = inject(SmartDocsApi);
  private readonly translate = inject(TranslateService);
  protected readonly fieldTypes = FIELD_TYPES;
  protected readonly roles = FIELD_ROLES;
  protected readonly types = signal<DocTypeDef[]>([]);
  protected readonly edit = signal<DocTypeDef | null>(null);
  protected readonly fields = signal<DocField[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly fieldError = signal<string | null>(null);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected keywords = ''; protected labelAr = '';
  protected newKey = ''; protected newLabel = ''; protected newType: DocField['type'] = 'text';
  protected createKey = ''; protected createLabel = '';

  constructor() { this.reload(); }

  private reload(selectKey?: string): void {
    this.api.types(true).subscribe({
      next: (t) => { this.types.set(t); const k = selectKey ?? this.edit()?.key; const sel = t.find((x) => x.key === k); if (sel) this.open(sel); },
      error: (e) => this.error.set(apiErrorMessage(e)),
    });
  }

  protected open(t: DocTypeDef): void {
    this.message.set(null); this.error.set(null); this.fieldError.set(null); this.fieldErrors.set({});
    this.edit.set({ ...t }); this.fields.set(t.fields.map((f) => ({ ...f }))); this.keywords = t.keywords.join(', '); this.labelAr = t.labelAr ?? '';
  }

  protected splitList(v: string): string[] { return v.split(',').map((x) => x.trim()).filter(Boolean); }
  protected upd(i: number, patch: Partial<DocField>): void { this.fields.update((l) => l.map((f, j) => (j === i ? { ...f, ...patch } : f))); }
  protected move(i: number, d: -1 | 1): void {
    this.fields.update((l) => { const a = [...l]; [a[i], a[i + d]] = [a[i + d], a[i]]; return a.map((f, j) => ({ ...f, order: j })); });
  }

  protected addField(): void {
    this.fieldError.set(null);
    if (!KEY.test(this.newKey)) { this.fieldError.set(this.translate.instant('smartDocs.types.keyHint') as string); return; }
    if (this.fields().some((f) => f.key === this.newKey)) { this.fieldError.set(this.translate.instant('smartDocs.types.keyUsed') as string); return; }
    if (!this.newLabel.trim()) { this.fieldError.set(this.translate.instant('validation.required') as string); return; }
    this.fields.update((l) => [...l, { key: this.newKey, label: this.newLabel.trim(), labelAr: null, type: this.newType, required: false, active: true, order: l.length, options: [], sensitive: false, role: null, referenceKind: this.newType === 'reference' ? 'employee' : null, aiHint: null, format: null }]);
    this.newKey = ''; this.newLabel = ''; this.newType = 'text';
  }

  protected saveType(): void {
    const t = this.edit(); if (!t) return;
    this.api.updateType(t.key, { label: t.label, labelAr: this.labelAr || null, expiringSoonDays: Number(t.expiringSoonDays), keywords: this.splitList(this.keywords), active: t.active }).subscribe({
      next: () => { this.message.set(this.translate.instant('smartDocs.saved') as string); this.reload(t.key); }, error: (e) => this.error.set(apiErrorMessage(e)),
    });
  }

  protected saveFields(): void {
    const t = this.edit(); if (!t) return;
    this.fieldError.set(null); this.fieldErrors.set({});
    this.api.saveFields(t.key, this.fields().map((f, i) => ({ ...f, order: i }))).subscribe({
      next: () => { this.message.set(this.translate.instant('smartDocs.saved') as string); this.reload(t.key); },
      error: (e) => { this.fieldErrors.set(fieldErrors(e)); this.fieldError.set(apiErrorMessage(e)); },
    });
  }

  protected startNew(): void { this.createKey = ''; this.createLabel = ''; this.createError.set(null); this.creating.set(true); }
  protected create(): void {
    if (!KEY.test(this.createKey) || !this.createLabel.trim()) { this.createError.set(this.translate.instant('smartDocs.types.keyHint') as string); return; }
    this.api.createType({ key: this.createKey, label: this.createLabel.trim(), fields: [{ key: 'title', label: 'Title', type: 'text', required: true, active: true, order: 0, role: 'title' } as DocField, { key: 'expiry_date', label: 'Expiry date', type: 'date', required: false, active: true, order: 1, role: 'expiry_date' } as DocField] }).subscribe({
      next: (t) => { this.creating.set(false); this.reload(t.key); }, error: (e) => this.createError.set(apiErrorMessage(e) ?? (this.translate.instant('smartDocs.saveFailed') as string)),
    });
  }
}
