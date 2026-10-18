import { DatePipe, JsonPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, interval, startWith, switchMap, takeWhile } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { buildForm, readForm, activeFields } from './form-model';
import { PdfPreview } from './pdf-preview';
import { SmartDocFields } from './smart-doc-fields';
import { SmartDocsApi } from './smart-docs-api.service';
import { Delivery, DocField, DocPatch, DocTypeDef, FieldValue, History, Lookups, ReminderJob, ReminderRule, SmartDoc, VersionRow } from './smart-docs.models';
import { EXTRACTION_TONE, REMINDER_TONE, STATUS_TONE, checkPdf, formatBytes, isBusy } from './smart-docs-ui';

type Tab = 'overview' | 'preview' | 'versions' | 'history' | 'reminders';
type Dialog = null | 'edit' | 'renew' | 'complete' | 'archive' | 'delete';

/** One document: what was approved, the file, its versions, what happened to it, and its reminders. */
@Component({
  selector: 'app-smart-doc-detail',
  imports: [RouterLink, FormsModule, ReactiveFormsModule, TranslatePipe, PageHeader, StatusBadge, PdfPreview, SmartDocFields, Modal, ConfirmDialog, CommentDialog, DatePipe, JsonPipe],
  template: `
    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'smartDocs.notFound' | translate }}</div>
      <a routerLink="/app/smart-documents/list">{{ 'smartDocs.back' | translate }}</a>
    } @else if (doc(); as d) {
      <app-page-header [title]="d.title">
        @if (d.status === 'pending_review' && can('documents.review')) { <a class="btn btn-primary" [routerLink]="['/app/smart-documents', d.id, 'review']">{{ 'smartDocs.actions.review' | translate }}</a> }
        @if (can('documents.download')) { <button type="button" class="btn btn-outline-secondary" (click)="download()">{{ 'smartDocs.actions.download' | translate }}</button> }
      </app-page-header>

      <div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <app-status-badge [label]="'smartDocs.status.' + d.status | translate" [tone]="statusTone(d.status)" />
        <app-status-badge [label]="'smartDocs.extraction.' + d.extractionStatus | translate" [tone]="extractionTone(d.extractionStatus)" />
        <app-status-badge [label]="'smartDocs.reminderStatus.' + d.reminderStatus | translate" [tone]="reminderTone(d.reminderStatus)" />
        <span class="text-body-secondary small">{{ type()?.label ?? d.typeKey }} · {{ 'smartDocs.version' | translate: { n: d.currentVersion } }}</span>
        @if (busy()) { <span class="small text-info-emphasis" role="status"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span> {{ 'smartDocs.processing' | translate }}</span> }
      </div>

      @if (message(); as m) { <div class="alert alert-success" role="status">{{ m }}</div> }
      @if (error(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }

      <div class="d-flex flex-wrap gap-2 mb-3" role="group" [attr.aria-label]="'smartDocs.actions.label' | translate">
        @if (can('documents.edit') && d.status !== 'archived') { <button type="button" class="btn btn-outline-primary btn-sm" (click)="open('edit')">{{ 'common.edit' | translate }}</button> }
        @if (can('documents.upload') && d.status !== 'archived') {
          <label class="btn btn-outline-primary btn-sm mb-0">{{ 'smartDocs.actions.replace' | translate }}
            <input type="file" class="visually-hidden" accept="application/pdf,.pdf" (change)="replace($event)" />
          </label>
        }
        @if (can('documents.edit') && ['pending_review','extraction_failed','active','approved','expiring_soon','expired','renewed'].includes(d.status)) { <button type="button" class="btn btn-outline-secondary btn-sm" (click)="reread()">{{ 'smartDocs.actions.reread' | translate }}</button> }
        @if (can('documents.edit') && ['approved','active','expiring_soon','expired'].includes(d.status)) { <button type="button" class="btn btn-outline-secondary btn-sm" (click)="open('renew')">{{ 'smartDocs.actions.startRenewal' | translate }}</button> }
        @if (can('documents.review') && d.status === 'renewal_in_progress') { <button type="button" class="btn btn-success btn-sm" (click)="open('complete')">{{ 'smartDocs.actions.completeRenewal' | translate }}</button> }
        @if (can('documents.archive') && d.status !== 'archived') { <button type="button" class="btn btn-outline-secondary btn-sm" (click)="open('archive')">{{ 'smartDocs.actions.archive' | translate }}</button> }
        @if (can('documents.delete')) { <button type="button" class="btn btn-outline-danger btn-sm" (click)="open('delete')">{{ 'common.delete' | translate }}</button> }
      </div>

      <ul class="nav nav-tabs mb-3" role="tablist" [attr.aria-label]="'smartDocs.tabs.label' | translate">
        @for (t of tabs; track t) {
          <li class="nav-item" role="presentation"><button type="button" class="nav-link" role="tab" [class.active]="tab() === t" [attr.aria-selected]="tab() === t" (click)="select(t)">{{ 'smartDocs.tabs.' + t | translate }}</button></li>
        }
      </ul>

      @switch (tab()) {
        @case ('overview') {
          <div class="row g-4">
            <div class="col-lg-7">
              <h2 class="h5">{{ 'smartDocs.overview.values' | translate }}</h2>
              @if (['uploaded','processing','pending_review','extraction_failed'].includes(d.status) && !hasValues()) { <p class="text-body-secondary">{{ 'smartDocs.overview.notApproved' | translate }}</p> }
              <dl class="row mb-0">
                @for (f of fields(); track f.key) {
                  <dt class="col-sm-5">{{ f.label }}</dt>
                  <dd class="col-sm-7" dir="auto">{{ show(f, d.values[f.key]) }}</dd>
                }
              </dl>
            </div>
            <div class="col-lg-5">
              <h2 class="h5">{{ 'smartDocs.overview.details' | translate }}</h2>
              <dl class="row mb-0">
                <dt class="col-sm-5">{{ 'smartDocs.overview.owner' | translate }}</dt><dd class="col-sm-7">{{ d.ownerName ?? '—' }}</dd>
                <dt class="col-sm-5">{{ 'smartDocs.overview.visibility' | translate }}</dt><dd class="col-sm-7">{{ 'smartDocs.visibility.' + d.visibility | translate }}</dd>
                <dt class="col-sm-5">{{ 'smartDocs.overview.expiry' | translate }}</dt><dd class="col-sm-7" dir="ltr">{{ d.expiryDate ?? '—' }}</dd>
                <dt class="col-sm-5">{{ 'smartDocs.overview.approved' | translate }}</dt><dd class="col-sm-7">{{ d.approvedAt ? (d.approvedAt | date: 'medium') : '—' }}</dd>
                <dt class="col-sm-5">{{ 'smartDocs.overview.created' | translate }}</dt><dd class="col-sm-7">{{ d.createdAt | date: 'medium' }}</dd>
              </dl>
            </div>
          </div>
        }
        @case ('preview') { <app-pdf-preview [docId]="d.id" /> }
        @case ('versions') {
          <div class="table-responsive"><table class="table align-middle">
            <caption class="visually-hidden">{{ 'smartDocs.tabs.versions' | translate }}</caption>
            <thead><tr><th scope="col">{{ 'smartDocs.versions.version' | translate }}</th><th scope="col">{{ 'smartDocs.versions.file' | translate }}</th><th scope="col">{{ 'smartDocs.versions.size' | translate }}</th><th scope="col">{{ 'smartDocs.versions.by' | translate }}</th><th scope="col">{{ 'smartDocs.versions.at' | translate }}</th><th scope="col"></th></tr></thead>
            <tbody>
              @for (v of versions(); track v.version) {
                <tr>
                  <td>{{ v.version }} @if (v.current) { <span class="badge text-bg-success">{{ 'smartDocs.versions.current' | translate }}</span> }</td>
                  <td dir="ltr">{{ v.fileName }}<div class="small text-body-secondary text-break">SHA-256 {{ v.sha256 }}</div></td>
                  <td>{{ bytes(v.sizeBytes) }}</td><td>{{ v.uploadedBy?.name ?? '—' }}</td><td>{{ v.uploadedAt | date: 'medium' }}</td>
                  <td>@if (can('documents.download')) { <button type="button" class="btn btn-outline-secondary btn-sm" (click)="download(v.version)">{{ 'smartDocs.actions.download' | translate }}</button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
        @case ('history') {
          @if (history(); as h) {
            <h2 class="h5">{{ 'smartDocs.history.events' | translate }}</h2>
            <ul class="list-group mb-4">
              @for (e of h.events; track $index) {
                <li class="list-group-item">
                  <div class="d-flex justify-content-between"><strong>{{ 'smartDocs.history.action.' + e.action | translate }}</strong><span class="text-body-secondary small">{{ e.at | date: 'medium' }}</span></div>
                  <div class="small text-body-secondary">{{ e.actor ?? ('smartDocs.history.system' | translate) }}</div>
                  @if (e.after) { <details class="small"><summary>{{ 'smartDocs.history.details' | translate }}</summary><pre class="mb-0">{{ e.after | json }}</pre></details> }
                </li>
              }
            </ul>
            <h2 class="h5">{{ 'smartDocs.history.processing' | translate }}</h2>
            @for (x of h.extractions; track x.id) {
              <div class="card mb-2"><div class="card-body py-2">
                <div class="d-flex justify-content-between"><span>{{ 'smartDocs.version' | translate: { n: x.version } }} · {{ 'smartDocs.extraction.' + x.status | translate }}</span><span class="small text-body-secondary">{{ x.at | date: 'medium' }}</span></div>
                <ul class="small mb-0 ps-3">
                  @for (s of x.steps; track $index) { <li>{{ s.name }}: {{ s.status }} @if (s.detail) { — {{ s.detail }} } ({{ s.ms }} ms)</li> }
                </ul>
                @if (x.error) { <div class="small text-danger">{{ x.error }}</div> }
              </div></div>
            }
          } @else { <p role="status">{{ 'common.loading' | translate }}</p> }
        }
        @case ('reminders') {
          <h2 class="h5">{{ 'smartDocs.reminders.inForce' | translate }}</h2>
          @if (rules().length === 0) { <p class="text-body-secondary">{{ 'smartDocs.reminders.noRules' | translate }}</p> }
          <ul class="list-group mb-4">
            @for (r of rules(); track r.id) {
              <li class="list-group-item"><strong>{{ r.name }}</strong> <span class="badge text-bg-light border">{{ 'smartDocs.reminders.scope.' + r.scope | translate }}</span>
                <div class="small text-body-secondary">{{ r.dateField }} · {{ offsetsText(r) }}</div></li>
            }
          </ul>
          <h2 class="h5">{{ 'smartDocs.reminders.scheduled' | translate }}</h2>
          <div class="table-responsive"><table class="table align-middle">
            <caption class="visually-hidden">{{ 'smartDocs.reminders.scheduled' | translate }}</caption>
            <thead><tr><th scope="col">{{ 'smartDocs.reminders.due' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.what' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.target' | translate }}</th><th scope="col">{{ 'smartDocs.reminders.status' | translate }}</th><th scope="col"></th></tr></thead>
            <tbody>
              @for (j of jobs(); track j.id) {
                <tr>
                  <td>{{ j.dueAt | date: 'medium' }}</td><td>{{ j.label }}</td><td dir="ltr">{{ j.targetDate }}</td>
                  <td>{{ 'smartDocs.job.' + j.status | translate }}@if (j.lastError || j.reason) { <div class="small text-body-secondary">{{ j.lastError ?? j.reason }}</div> }</td>
                  <td>
                    @if (j.status === 'sent' && !j.acknowledgedAt && j.kind === 'reminder') { <button type="button" class="btn btn-outline-secondary btn-sm" (click)="ack(j)">{{ 'smartDocs.reminders.acknowledge' | translate }}</button> }
                    @if ((j.status === 'failed' || j.status === 'skipped') && can('documents.manage')) { <button type="button" class="btn btn-outline-primary btn-sm" (click)="retry(j)">{{ 'common.retry' | translate }}</button> }
                  </td>
                </tr>
              } @empty { <tr><td colspan="5" class="text-body-secondary">{{ 'smartDocs.reminders.none' | translate }}</td></tr> }
            </tbody>
          </table></div>
          <h2 class="h5">{{ 'smartDocs.reminders.deliveries' | translate }}</h2>
          <ul class="list-group">
            @for (x of deliveries(); track x.id) {
              <li class="list-group-item d-flex justify-content-between"><span>{{ x.userName }} · {{ 'smartDocs.channel.' + x.channel | translate }} · {{ 'smartDocs.delivery.' + x.status | translate }}@if (x.error) { <span class="text-danger small"> — {{ x.error }}</span> }</span><span class="small text-body-secondary">{{ x.at | date: 'medium' }}</span></li>
            } @empty { <li class="list-group-item text-body-secondary">{{ 'smartDocs.reminders.noDeliveries' | translate }}</li> }
          </ul>
        }
      }

      @switch (dialog()) {
        @case ('edit') {
          <app-modal [title]="'common.edit' | translate" width="44rem" (closed)="open(null)">
            <form [formGroup]="editMeta" (ngSubmit)="saveEdit()" novalidate>
              <div class="row g-2 mb-3">
                <div class="col-12"><label class="form-label" for="ed-title">{{ 'smartDocs.upload.title' | translate }}</label><input id="ed-title" class="form-control" formControlName="title" /></div>
                <div class="col-md-6"><label class="form-label" for="ed-owner">{{ 'smartDocs.overview.owner' | translate }}</label>
                  <select id="ed-owner" class="form-select" formControlName="ownerId"><option value=""></option>@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
                <div class="col-md-6"><label class="form-label" for="ed-vis">{{ 'smartDocs.overview.visibility' | translate }}</label>
                  <select id="ed-vis" class="form-select" formControlName="visibility"><option value="office">{{ 'smartDocs.visibility.office' | translate }}</option><option value="restricted">{{ 'smartDocs.visibility.restricted' | translate }}</option></select></div>
                <div class="col-md-6"><label class="form-label" for="ed-dep">{{ 'smartDocs.upload.department' | translate }}</label>
                  <select id="ed-dep" class="form-select" formControlName="departmentId"><option value=""></option>@for (x of lookups()?.departments ?? []; track x.id) { <option [value]="x.id">{{ x.name }}</option> }</select></div>
                @if (lookups()?.employees?.length) {
                  <div class="col-md-6"><label class="form-label" for="ed-emp">{{ 'smartDocs.upload.employee' | translate }}</label>
                    <select id="ed-emp" class="form-select" formControlName="employeeId"><option value=""></option>@for (x of lookups()?.employees ?? []; track x.id) { <option [value]="x.id">{{ x.name }}</option> }</select></div>
                }
              </div>
              @if (valuesEditable()) { <h3 class="h6">{{ 'smartDocs.overview.values' | translate }}</h3><app-smart-doc-fields [fieldDefs]="type()!.fields" [form]="valuesForm()" [lookups]="lookups()" [serverErrors]="serverErrors()" /> }
              @if (dialogError(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
              <div class="d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="open(null)">{{ 'common.cancel' | translate }}</button><button type="submit" class="btn btn-primary">{{ 'common.save' | translate }}</button></div>
            </form>
          </app-modal>
        }
        @case ('complete') {
          <app-modal [title]="'smartDocs.renewal.title' | translate" width="40rem" (closed)="open(null)">
            <p>{{ 'smartDocs.renewal.hint' | translate }}</p>
            <form (ngSubmit)="saveRenewal()" novalidate>
              <app-smart-doc-fields [fieldDefs]="dateFields()" [form]="valuesForm()" [serverErrors]="serverErrors()" />
              @if (dialogError(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
              <div class="d-flex justify-content-end gap-2"><button type="button" class="btn btn-outline-secondary" (click)="open(null)">{{ 'common.cancel' | translate }}</button><button type="submit" class="btn btn-success">{{ 'smartDocs.actions.completeRenewal' | translate }}</button></div>
            </form>
          </app-modal>
        }
        @case ('renew') { <app-comment-dialog [title]="'smartDocs.actions.startRenewal' | translate" [message]="'smartDocs.renewal.startHint' | translate" [label]="'smartDocs.renewal.reason' | translate" [confirmLabel]="'common.confirm' | translate" (confirmed)="startRenewal($event)" (cancelled)="open(null)" /> }
        @case ('archive') { <app-comment-dialog [title]="'smartDocs.actions.archive' | translate" [message]="'smartDocs.archive.hint' | translate" [label]="'smartDocs.renewal.reason' | translate" [confirmLabel]="'smartDocs.actions.archive' | translate" (confirmed)="archive($event)" (cancelled)="open(null)" /> }
        @case ('delete') { <app-confirm-dialog [title]="'common.delete' | translate" [message]="'smartDocs.delete.message' | translate: { title: d.title }" [confirmLabel]="'common.delete' | translate" [danger]="true" (confirmed)="remove()" (cancelled)="open(null)" /> }
      }
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }
  `,
})
export class SmartDocDetail {
  private readonly api = inject(SmartDocsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly tabs: Tab[] = ['overview', 'preview', 'versions', 'history', 'reminders'];
  protected readonly tab = signal<Tab>('overview');
  protected readonly doc = signal<SmartDoc | null>(null);
  protected readonly type = signal<DocTypeDef | null>(null);
  protected readonly versions = signal<VersionRow[]>([]);
  protected readonly history = signal<History | null>(null);
  protected readonly rules = signal<ReminderRule[]>([]);
  protected readonly jobs = signal<ReminderJob[]>([]);
  protected readonly deliveries = signal<Delivery[]>([]);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<Dialog>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly valuesForm = signal<FormGroup>(new FormGroup({}));
  protected readonly editMeta = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }), ownerId: new FormControl('', { nonNullable: true }), visibility: new FormControl<'office' | 'restricted'>('office', { nonNullable: true }),
    departmentId: new FormControl('', { nonNullable: true }), employeeId: new FormControl('', { nonNullable: true }),
  });
  protected readonly fields = computed(() => activeFields(this.type()?.fields ?? []));
  protected readonly busy = computed(() => { const d = this.doc(); return !!d && isBusy(d.status, d.extractionStatus); });
  protected readonly hasValues = computed(() => Object.values(this.doc()?.values ?? {}).some((v) => v !== null && v !== undefined));
  protected readonly valuesEditable = computed(() => !!this.type() && ['approved', 'active', 'expiring_soon', 'expired', 'renewed'].includes(this.doc()?.status ?? '') && this.can('documents.edit'));
  protected readonly dateFields = computed<DocField[]>(() => this.fields().filter((f) => f.type === 'date'));
  protected readonly statusTone = (s: SmartDoc['status']) => STATUS_TONE[s];
  protected readonly extractionTone = (s: SmartDoc['extractionStatus']) => EXTRACTION_TONE[s];
  protected readonly reminderTone = (s: SmartDoc['reminderStatus']) => REMINDER_TONE[s];
  protected readonly can = (p: string) => this.auth.can(p);
  protected readonly bytes = formatBytes;

  constructor() {
    this.api.lookups().subscribe({ next: (l) => this.lookups.set(l), error: () => undefined });
    this.api.config().subscribe({ next: (c) => (this.maxMb = c.limits.maxUploadMb), error: () => undefined });
    interval(4000).pipe(startWith(0), switchMap(() => this.api.get(this.id)), takeWhile((d) => isBusy(d.status, d.extractionStatus), true), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => this.setDoc(d), error: () => this.loadFailed.set(true),
    });
  }

  private setDoc(d: SmartDoc): void {
    const typeChanged = this.type()?.key !== d.typeKey;
    this.doc.set(d);
    if (typeChanged) this.api.type(d.typeKey).subscribe({ next: (t) => this.type.set(t), error: () => undefined });
  }

  private refresh(): void { this.api.get(this.id).subscribe((d) => { this.setDoc(d); this.loadTab(this.tab()); }); }

  protected select(t: Tab): void { this.tab.set(t); this.loadTab(t); }
  private loadTab(t: Tab): void {
    if (t === 'versions') this.api.versions(this.id).subscribe((v) => this.versions.set(v));
    if (t === 'history') this.api.history(this.id).subscribe((h) => this.history.set(h));
    if (t === 'reminders') forkJoin({ r: this.api.documentRules(this.id), j: this.api.reminders({ documentId: this.id, status: 'sent', pageSize: 50 }), s: this.api.reminders({ documentId: this.id, pageSize: 50 }), d: this.api.deliveries({ documentId: this.id, pageSize: 50 }) })
      .subscribe((x) => { this.rules.set(x.r); this.jobs.set([...x.s.data, ...x.j.data]); this.deliveries.set(x.d.data); });
  }

  protected show(f: DocField, v: FieldValue | undefined): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return this.translate.instant(v ? 'common.yes' : 'common.no') as string;
    if (typeof v === 'object') return `${v.amount.toLocaleString()} ${v.currency ?? ''}`.trim();
    return String(v);
  }

  protected offsetsText(r: ReminderRule): string {
    return r.offsets.map((o) => this.translate.instant(`smartDocs.reminders.offset.${o.direction}`, { n: o.amount, unit: this.translate.instant('smartDocs.unit.' + o.unit) }) as string).join(', ');
  }

  protected open(d: Dialog): void {
    this.dialogError.set(null); this.serverErrors.set({});
    const doc = this.doc(); const type = this.type();
    if (d === 'edit' && doc) {
      this.editMeta.reset({ title: doc.title, ownerId: doc.ownerId ?? '', visibility: doc.visibility, departmentId: doc.departmentId ?? '', employeeId: doc.employeeId ?? '' });
      if (this.valuesEditable() && type) this.valuesForm.set(buildForm(type.fields, doc.values));
    }
    if (d === 'complete' && doc && type) this.valuesForm.set(buildForm(this.dateFields(), doc.values));
    this.dialog.set(d);
  }

  private done(key: string, d?: SmartDoc): void {
    this.dialog.set(null); this.error.set(null);
    this.message.set(this.translate.instant(key) as string);
    if (d) { this.setDoc(d); this.loadTab(this.tab()); } else this.refresh();
  }
  private fail(e: unknown, inDialog = false): void {
    const m = apiErrorMessage(e) ?? (this.translate.instant('smartDocs.saveFailed') as string);
    if (inDialog) { this.dialogError.set(m); this.serverErrors.set(fieldErrors(e)); } else { this.error.set(m); this.message.set(null); }
  }

  protected saveEdit(): void {
    if (this.editMeta.invalid) { this.editMeta.markAllAsTouched(); return; }
    const m = this.editMeta.getRawValue();
    const patch: DocPatch = { title: m.title, ownerId: m.ownerId || null as never, visibility: m.visibility, departmentId: m.departmentId || null as never, employeeId: m.employeeId || null as never };
    if (this.valuesEditable() && this.type()) patch.values = readForm(this.type()!.fields, this.valuesForm());
    this.api.update(this.id, patch).subscribe({ next: (d) => this.done('smartDocs.saved', d), error: (e) => this.fail(e, true) });
  }

  protected startRenewal(reason: string): void { this.api.startRenewal(this.id, reason || undefined).subscribe({ next: (d) => this.done('smartDocs.renewal.started', d), error: (e) => { this.dialog.set(null); this.fail(e); } }); }
  protected saveRenewal(): void {
    const values = readForm(this.dateFields(), this.valuesForm());
    this.api.completeRenewal(this.id, values).subscribe({ next: (d) => this.done('smartDocs.renewal.done', d), error: (e) => this.fail(e, true) });
  }
  protected archive(reason: string): void { this.api.archive(this.id, reason || undefined).subscribe({ next: (d) => this.done('smartDocs.archive.done', d), error: (e) => { this.dialog.set(null); this.fail(e); } }); }
  protected remove(): void { this.api.remove(this.id).subscribe({ next: () => void this.router.navigate(['/app/smart-documents/list']), error: (e) => { this.dialog.set(null); this.fail(e); } }); }
  protected reread(): void { this.api.extract(this.id).subscribe({ next: () => this.done('smartDocs.rereadQueued'), error: (e) => this.fail(e) }); }

  protected download(version?: number): void {
    this.api.file(this.id, { version }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${this.doc()?.title ?? 'document'}.pdf`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e) => this.fail(e),
    });
  }

  protected async replace(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const problem = await checkPdf(file, (this.maxMb ?? 20) * 1_048_576);
    if (problem) { this.error.set(this.translate.instant(`smartDocs.upload.problem.${problem}`) as string); return; }
    this.api.uploadVersion(this.id, file).subscribe({ next: (e) => { if (e.kind === 'done') this.done('smartDocs.replaced', e.doc); }, error: (e) => this.fail(e) });
  }
  private maxMb: number | null = null;

  protected ack(j: ReminderJob): void { this.api.acknowledge(j.id).subscribe({ next: () => this.loadTab('reminders'), error: (e) => this.fail(e) }); }
  protected retry(j: ReminderJob): void { this.api.retry(j.id).subscribe({ next: () => this.loadTab('reminders'), error: (e) => this.fail(e) }); }
}
