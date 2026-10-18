import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { forkJoin, interval, startWith, switchMap, takeWhile } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { FieldState, buildForm, draftFrom, readForm, sameValue, startingValues } from './form-model';
import { Highlight, PdfPreview } from './pdf-preview';
import { SmartDocFields } from './smart-doc-fields';
import { SmartDocsApi } from './smart-docs-api.service';
import { DocTypeDef, Extraction, FieldValue, Lookups, SmartConfig, SmartDoc } from './smart-docs.models';
import { EXTRACTION_TONE, STATUS_TONE, isBusy } from './smart-docs-ui';

/**
 * The reviewer's screen: the PDF next to a form that the extraction has pre-filled. Nothing is stored on the document until the reviewer
 * approves; a draft can be saved and resumed. Document status stays "pending review" until then.
 */
@Component({
  selector: 'app-smart-doc-review',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader, StatusBadge, PdfPreview, SmartDocFields, DatePipe],
  template: `
    @if (loadFailed()) {
      <div class="alert alert-danger" role="alert">{{ 'smartDocs.notFound' | translate }}</div>
      <a routerLink="/app/smart-documents/list">{{ 'smartDocs.back' | translate }}</a>
    } @else if (doc(); as d) {
      <app-page-header [title]="'smartDocs.review.title' | translate: { title: d.title }">
        <a class="btn btn-outline-secondary" [routerLink]="['/app/smart-documents', d.id]">{{ 'smartDocs.review.backToDocument' | translate }}</a>
      </app-page-header>

      <div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
        <app-status-badge [label]="'smartDocs.status.' + d.status | translate" [tone]="statusTone(d.status)" />
        @if (extraction(); as x) { <app-status-badge [label]="'smartDocs.extraction.' + x.status | translate" [tone]="extractionTone(x.status)" /> }
        <span class="text-body-secondary small">{{ 'smartDocs.review.neverAuto' | translate }}</span>
      </div>

      @if (busy()) {
        <div class="alert alert-info" role="status">{{ 'smartDocs.review.processing' | translate }}</div>
      } @else {
        @if (config()?.ai?.configured === false) { <div class="alert alert-warning" role="status">{{ 'smartDocs.review.noAi' | translate }}</div> }
        @if (extraction(); as x) {
          @if (x.status === 'needs_ocr') { <div class="alert alert-warning" role="status">{{ 'smartDocs.review.needsOcr' | translate }}</div> }
          @if (x.status === 'failed' || d.status === 'extraction_failed') {
            <div class="alert alert-danger" role="alert">{{ 'smartDocs.review.failed' | translate }} {{ x.error }}</div>
          }
          @for (n of x.notes; track n) { <div class="alert alert-light border py-2" role="note">{{ n }}</div> }
        }
        @if (d.status === 'extraction_failed' && canReview()) {
          <button type="button" class="btn btn-outline-primary mb-3" (click)="manual()">{{ 'smartDocs.review.manualEntry' | translate }}</button>
        }
      }

      <div class="row g-4">
        <div class="col-xl-6">
          <app-pdf-preview [docId]="d.id" [page]="page()" [highlight]="highlight()" />
          @if (sourceText(); as s) {
            <div class="card mt-3"><div class="card-body">
              <h2 class="h6">{{ 'smartDocs.review.evidence' | translate: { page: page() } }}</h2>
              <pre class="small mb-0 text-wrap" dir="auto" style="max-block-size: 14rem; overflow: auto">{{ s }}</pre>
            </div></div>
          }
        </div>

        <div class="col-xl-6">
          @if (type(); as t) {
            <div class="mb-3">
              <label class="form-label" for="rv-type">{{ 'smartDocs.review.type' | translate }}</label>
              <div class="d-flex gap-2">
                <select id="rv-type" class="form-select" [value]="typeKey()" (change)="typeKey.set($any($event.target).value)" [disabled]="d.status !== 'pending_review' || !canEdit()">
                  @for (o of types(); track o.key) { <option [value]="o.key" [selected]="o.key === typeKey()">{{ o.label }}</option> }
                </select>
                @if (typeKey() !== d.typeKey) { <button type="button" class="btn btn-outline-primary" (click)="rerun()">{{ 'smartDocs.review.reread' | translate }}</button> }
              </div>
              @if (extraction()?.detectedType; as dt) {
                @if (dt.key && dt.method !== 'user') { <div class="form-text">{{ 'smartDocs.review.detected' | translate: { type: labelOfType(dt.key), method: ('smartDocs.review.method.' + dt.method | translate) } }}</div> }
              }
            </div>

            <form (ngSubmit)="approve()" novalidate>
              <app-smart-doc-fields [fieldDefs]="t.fields" [form]="form()" [extraction]="extraction()?.fields ?? null" [states]="states()" [lookups]="lookups()" [serverErrors]="serverErrors()"
                (accepted)="accept($event)" (rejected)="reject($event)" (source)="showSource($event)" (touched)="touch($event)" />
              @if (error(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
              @if (draftSavedAt(); as at) { <p class="small text-body-secondary" role="status">{{ 'smartDocs.review.draftSaved' | translate: { at: (at | date: 'medium') } }}</p> }
              @if (d.status === 'pending_review' && canReview()) {
                <div class="d-flex flex-wrap gap-2">
                  <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'smartDocs.review.approve' | translate }}</button>
                  <button type="button" class="btn btn-outline-secondary" [disabled]="saving()" (click)="saveDraft()">{{ 'smartDocs.review.saveDraft' | translate }}</button>
                </div>
              } @else if (d.status !== 'pending_review') {
                <p class="text-body-secondary">{{ 'smartDocs.review.notPending' | translate }}</p>
              }
            </form>
          }
        </div>
      </div>
    } @else {
      <p role="status">{{ 'common.loading' | translate }}</p>
    }
  `,
})
export class SmartDocReview {
  private readonly api = inject(SmartDocsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly doc = signal<SmartDoc | null>(null);
  protected readonly types = signal<DocTypeDef[]>([]);
  protected readonly typeKey = signal('');
  protected readonly extraction = signal<Extraction | null>(null);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly config = signal<SmartConfig | null>(null);
  protected readonly form = signal<FormGroup>(new FormGroup({}));
  protected readonly states = signal<Record<string, FieldState>>({});
  protected readonly page = signal(1);
  protected readonly sourceText = signal<string | null>(null);
  protected readonly highlight = signal<Highlight | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly draftSavedAt = signal<string | null>(null);
  protected readonly type = computed(() => this.types().find((t) => t.key === this.doc()?.typeKey) ?? null);
  protected readonly busy = computed(() => { const d = this.doc(); return !!d && isBusy(d.status, this.extraction()?.status ?? d.extractionStatus); });
  protected readonly statusTone = (s: SmartDoc['status']) => STATUS_TONE[s];
  protected readonly extractionTone = (s: Extraction['status']) => EXTRACTION_TONE[s];
  protected readonly canReview = () => this.auth.can('documents.review');
  protected readonly canEdit = () => this.auth.can('documents.edit');
  private proposed: Record<string, FieldValue> = {};

  constructor() {
    this.api.config().subscribe({ next: (c) => this.config.set(c), error: () => undefined });
    this.api.lookups().subscribe({ next: (l) => this.lookups.set(l), error: () => undefined });
    this.poll();
  }

  /** Asks again every few seconds while the server is still reading the file; the form is built once it has finished. */
  private poll(): void {
    interval(3000).pipe(startWith(0), switchMap(() => forkJoin({ doc: this.api.get(this.id), extraction: this.api.extraction(this.id) })),
      takeWhile((r) => isBusy(r.doc.status, r.extraction?.status ?? r.doc.extractionStatus), true), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => this.load(r.doc, r.extraction),
      error: () => this.loadFailed.set(true),
    });
  }

  private load(doc: SmartDoc, ex: Extraction | null): void {
    const first = this.doc() === null;
    this.doc.set(doc); this.extraction.set(ex);
    if (this.types().length === 0) this.api.types().subscribe((t) => { this.types.set(t); this.typeKey.set(doc.typeKey); this.build(doc, ex); });
    else if (first || !this.busy()) { this.typeKey.set(doc.typeKey); this.build(doc, ex); }
    this.draftSavedAt.set(ex?.draftSavedAt ?? null);
  }

  private build(doc: SmartDoc, ex: Extraction | null): void {
    const t = this.types().find((x) => x.key === doc.typeKey);
    if (!t || isBusy(doc.status, ex?.status ?? doc.extractionStatus)) return;
    const { values, states } = startingValues(t.fields, ex?.fields ?? [], ex?.draft ?? {}, doc.values);
    this.proposed = Object.fromEntries((ex?.fields ?? []).filter((f) => f.state === 'extracted' && !f.masked).map((f) => [f.key, (f.normalizedValue ?? null) as FieldValue]));
    this.form.set(buildForm(t.fields, values));
    this.states.set(states);
  }

  protected labelOfType(key: string): string { return this.types().find((t) => t.key === key)?.label ?? key; }

  protected touch(key: string): void {
    const t = this.type(); if (!t) return;
    const now = readForm(t.fields, this.form())[key];
    this.states.update((s) => ({ ...s, [key]: key in this.proposed && sameValue(now, this.proposed[key]) ? (s[key] === 'accepted' ? 'accepted' : 'pending') : 'edited' }));
  }
  protected accept(key: string): void { this.states.update((s) => ({ ...s, [key]: 'accepted' })); }
  protected reject(key: string): void {
    const t = this.type(); const f = t?.fields.find((x) => x.key === key); if (!f) return;
    const c = this.form().get(key); if (f.type === 'currency') (c as FormGroup).reset(); else c?.reset(null);
    this.states.update((s) => ({ ...s, [key]: 'rejected' }));
  }

  protected showSource(key: string): void {
    const e = this.extraction()?.fields.find((f) => f.key === key);
    if (!e?.page) return;
    this.page.set(e.page);
    this.highlight.set({ page: e.page, bbox: e.bbox });
    this.sourceText.set(e.sourceText ?? null);
    if (this.canReview()) this.api.pageText(this.id, e.page).subscribe({ next: (p) => this.sourceText.set(p.text), error: () => undefined });
  }

  protected saveDraft(): void {
    const t = this.type(); if (!t) return;
    this.saving.set(true); this.error.set(null);
    this.api.saveDraft(this.id, draftFrom(t.fields, readForm(t.fields, this.form()), this.states())).subscribe({
      next: (r) => { this.saving.set(false); this.draftSavedAt.set(r.savedAt); },
      error: (e) => { this.saving.set(false); this.error.set(apiErrorMessage(e) ?? (this.translate.instant('smartDocs.saveFailed') as string)); },
    });
  }

  protected approve(): void {
    const t = this.type(); if (!t) return;
    this.form().markAllAsTouched();
    this.serverErrors.set({}); this.error.set(null);
    if (this.form().invalid) { this.error.set(this.translate.instant('smartDocs.review.fixErrors') as string); return; }
    this.saving.set(true);
    this.api.approve(this.id, readForm(t.fields, this.form())).subscribe({
      next: (d) => { this.saving.set(false); void this.router.navigate(['/app/smart-documents', d.id]); },
      error: (e) => { this.saving.set(false); this.serverErrors.set(fieldErrors(e)); this.error.set(apiErrorMessage(e) ?? (this.translate.instant('smartDocs.saveFailed') as string)); },
    });
  }

  protected manual(): void { this.api.manualEntry(this.id).subscribe({ next: (d) => { this.doc.set(d); this.build(d, this.extraction()); }, error: (e) => this.error.set(apiErrorMessage(e)) }); }

  /** Reads the file again as another document type. The old values are kept until the person approves something. */
  protected rerun(): void {
    this.api.extract(this.id, this.typeKey()).subscribe({ next: () => { this.extraction.update((x) => (x ? { ...x, status: 'queued' } : x)); this.poll(); }, error: (e) => this.error.set(apiErrorMessage(e)) });
  }
}
