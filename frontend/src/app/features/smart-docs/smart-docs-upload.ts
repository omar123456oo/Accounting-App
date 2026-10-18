import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { SmartDocsApi } from './smart-docs-api.service';
import { DocTypeDef, Lookups, SmartConfig } from './smart-docs.models';
import { PdfProblem, checkPdf, formatBytes } from './smart-docs-ui';

/** Drag a PDF in (or choose one), say what it is if you know, and upload. Reading it starts as soon as it is stored. */
@Component({
  selector: 'app-smart-docs-upload',
  imports: [FormsModule, RouterLink, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'smartDocs.upload.title2' | translate" />
    @if (config(); as c) {
      @if (!c.ai.configured) { <div class="alert alert-warning" role="status">{{ 'smartDocs.upload.noAi' | translate }}</div> }
    }

    <div class="drop rounded border border-2 p-4 text-center mb-3" [class.border-primary]="over()" [class.bg-body-tertiary]="over()" tabindex="0" role="button" [attr.aria-label]="'smartDocs.upload.drop' | translate"
      (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="drop($event)" (click)="picker.click()" (keydown.enter)="picker.click()" (keydown.space)="$event.preventDefault(); picker.click()">
      <i class="fa-solid fa-file-pdf fa-2x mb-2" aria-hidden="true"></i>
      <p class="mb-1">{{ 'smartDocs.upload.drop' | translate }}</p>
      <p class="small text-body-secondary mb-0">{{ 'smartDocs.upload.hint' | translate: { mb: maxMb() } }}</p>
      <input #picker type="file" class="visually-hidden" accept="application/pdf,.pdf" tabindex="-1" (change)="pick($event)" />
    </div>

    @if (problem(); as p) { <div class="alert alert-danger" role="alert">{{ 'smartDocs.upload.problem.' + p | translate }}</div> }
    @if (file(); as f) {
      <p class="mb-3"><i class="fa-regular fa-file-pdf me-1" aria-hidden="true"></i><strong dir="ltr">{{ f.name }}</strong> <span class="text-body-secondary">({{ bytes(f.size) }})</span></p>
    }

    <form (ngSubmit)="submit()" class="row g-3" novalidate>
      <div class="col-md-6"><label class="form-label" for="up-title">{{ 'smartDocs.upload.title' | translate }}</label><input id="up-title" name="title" class="form-control" [(ngModel)]="title" /></div>
      <div class="col-md-6"><label class="form-label" for="up-type">{{ 'smartDocs.upload.type' | translate }}</label>
        <select id="up-type" name="type" class="form-select" [(ngModel)]="typeKey"><option value="">{{ 'smartDocs.upload.detect' | translate }}</option>@for (t of types(); track t.key) { <option [value]="t.key">{{ t.label }}</option> }</select></div>
      <div class="col-md-4"><label class="form-label" for="up-owner">{{ 'smartDocs.overview.owner' | translate }}</label>
        <select id="up-owner" name="owner" class="form-select" [(ngModel)]="ownerId"><option value="">{{ 'smartDocs.upload.me' | translate }}</option>@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
      <div class="col-md-4"><label class="form-label" for="up-dep">{{ 'smartDocs.upload.department' | translate }}</label>
        <select id="up-dep" name="dep" class="form-select" [(ngModel)]="departmentId"><option value=""></option>@for (d of lookups()?.departments ?? []; track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select></div>
      @if (lookups()?.employees?.length) {
        <div class="col-md-4"><label class="form-label" for="up-emp">{{ 'smartDocs.upload.employee' | translate }}</label>
          <select id="up-emp" name="emp" class="form-select" [(ngModel)]="employeeId"><option value=""></option>@for (e of lookups()?.employees ?? []; track e.id) { <option [value]="e.id">{{ e.name }}</option> }</select></div>
      }
      <div class="col-md-6"><label class="form-label" for="up-reviewer">{{ 'smartDocs.upload.reviewer' | translate }}</label>
        <select id="up-reviewer" name="reviewer" class="form-select" [(ngModel)]="reviewerId"><option value=""></option>@for (u of lookups()?.users ?? []; track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select></div>
      <div class="col-md-6"><label class="form-label" for="up-vis">{{ 'smartDocs.overview.visibility' | translate }}</label>
        <select id="up-vis" name="vis" class="form-select" [(ngModel)]="visibility"><option value="office">{{ 'smartDocs.visibility.office' | translate }}</option><option value="restricted">{{ 'smartDocs.visibility.restricted' | translate }}</option></select></div>

      @if (duplicate()) {
        <div class="col-12"><div class="alert alert-warning mb-0" role="alert">{{ 'smartDocs.upload.duplicate' | translate }}
          <div class="form-check mt-2"><input id="up-dup" name="dup" type="checkbox" class="form-check-input" [(ngModel)]="allowDuplicate" /><label class="form-check-label" for="up-dup">{{ 'smartDocs.upload.duplicateAllow' | translate }}</label></div></div></div>
      }
      @if (error(); as e) { <div class="col-12"><div class="alert alert-danger mb-0" role="alert">{{ e }}</div></div> }
      @if (progress() !== null) {
        <div class="col-12"><div class="progress" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'smartDocs.upload.progress' | translate"><div class="progress-bar" [style.width.%]="progress()">{{ progress() }}%</div></div></div>
      }
      <div class="col-12 d-flex gap-2">
        <button type="submit" class="btn btn-primary" [disabled]="!file() || busy()">{{ 'smartDocs.upload.button' | translate }}</button>
        <a class="btn btn-outline-secondary" routerLink="/app/smart-documents/list">{{ 'common.cancel' | translate }}</a>
      </div>
    </form>
  `,
  styles: `.drop { cursor: pointer; border-style: dashed !important; }`,
})
export class SmartDocsUpload {
  private readonly api = inject(SmartDocsApi);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  protected readonly bytes = formatBytes;

  protected readonly config = signal<SmartConfig | null>(null);
  protected readonly types = signal<DocTypeDef[]>([]);
  protected readonly lookups = signal<Lookups | null>(null);
  protected readonly maxMb = computed(() => this.config()?.limits.maxUploadMb ?? 20);
  protected readonly file = signal<File | null>(null);
  protected readonly problem = signal<PdfProblem | null>(null);
  protected readonly over = signal(false);
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly duplicate = signal(false);
  protected title = ''; protected typeKey = ''; protected ownerId = ''; protected departmentId = ''; protected employeeId = ''; protected reviewerId = '';
  protected visibility: 'office' | 'restricted' = 'office';
  protected allowDuplicate = false;

  constructor() {
    this.api.config().subscribe({ next: (c) => this.config.set(c), error: () => undefined });
    this.api.types().subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    this.api.lookups().subscribe({ next: (l) => this.lookups.set(l), error: () => undefined });
  }

  protected drop(e: DragEvent): void { e.preventDefault(); this.over.set(false); void this.choose(e.dataTransfer?.files?.[0] ?? null); }
  protected pick(e: Event): void { const i = e.target as HTMLInputElement; void this.choose(i.files?.[0] ?? null); i.value = ''; }

  private async choose(f: File | null): Promise<void> {
    this.error.set(null); this.duplicate.set(false); this.allowDuplicate = false;
    if (!f) return;
    const p = await checkPdf(f, this.maxMb() * 1_048_576);
    this.problem.set(p); this.file.set(p ? null : f);
    if (!p && !this.title) this.title = f.name.replace(/\.pdf$/i, '');
  }

  protected submit(): void {
    const f = this.file(); if (!f || this.busy()) return;
    this.busy.set(true); this.error.set(null); this.progress.set(0);
    this.api.upload({ file: f, title: this.title.trim() || undefined, typeKey: this.typeKey || undefined, ownerId: this.ownerId || undefined, employeeId: this.employeeId || undefined, departmentId: this.departmentId || undefined, reviewerId: this.reviewerId || undefined, visibility: this.visibility, allowDuplicate: this.allowDuplicate }).subscribe({
      next: (e) => { if (e.kind === 'progress') this.progress.set(e.percent); else void this.router.navigate(['/app/smart-documents', e.doc.id]); },
      error: (e: unknown) => {
        this.busy.set(false); this.progress.set(null);
        if (e instanceof HttpErrorResponse && e.status === 409) { this.duplicate.set(true); this.error.set(null); return; }
        this.error.set(apiErrorMessage(e) ?? (this.translate.instant('smartDocs.saveFailed') as string));
      },
    });
  }
}
