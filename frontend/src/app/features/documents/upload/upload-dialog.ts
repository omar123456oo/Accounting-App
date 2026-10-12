import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { Modal } from '../../../shared/components/modal/modal';
import { DocumentsApiService } from '../documents-api.service';
import { AssignableClient, DOCUMENT_CATEGORIES, DocumentRecord, DocumentRequest } from '../documents.models';
import { ACCEPT_ATTRIBUTE, FileProblem, MAX_FILE_BYTES, checkFile, extensionOf } from '../file-validation';

/**
 * Upload form for a new document or a new version. The checks here (size, extension, declared MIME type and
 * the file's first bytes) are quick feedback only: the server re-validates the bytes and scans for malware.
 */
@Component({
  selector: 'app-upload-dialog',
  imports: [ReactiveFormsModule, TranslatePipe, Modal, FieldError],
  templateUrl: './upload-dialog.html',
})
export class UploadDialog implements OnInit {
  private readonly api = inject(DocumentsApiService);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Set for a fixed client; otherwise the user picks one of `clients`. */
  readonly clientId = input<string>();
  readonly clients = input<readonly AssignableClient[]>([]);
  /** Set to add a version to this document instead of creating one. */
  readonly documentId = input<string>();
  readonly requests = input<readonly DocumentRequest[]>([]);
  readonly presetRequestId = input<string>();
  readonly uploaded = output<DocumentRecord>();
  readonly cancelled = output<void>();

  protected readonly categories = DOCUMENT_CATEGORIES;
  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly maxMb = MAX_FILE_BYTES / (1024 * 1024);
  protected readonly file = signal<File | null>(null);
  protected readonly problem = signal<FileProblem | null>(null);
  protected readonly checking = signal(false);
  protected readonly submitting = signal(false);
  protected readonly attempted = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly isVersion = computed(() => !!this.documentId());

  protected readonly form = this.fb.group({
    clientId: ['', Validators.required],
    name: ['', Validators.required],
    category: ['bookkeeping' as (typeof DOCUMENT_CATEGORIES)[number], Validators.required],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(2000), Validators.max(2100)]],
    periodLabel: [''],
    tags: [''],
    description: [''],
    expiryDate: [''],
    requestId: [''],
  });

  protected readonly openRequests = computed(() => this.requests().filter((r) => r.status === 'open'));

  ngOnInit(): void {
    this.form.patchValue({ clientId: this.clientId() ?? '', requestId: this.presetRequestId() ?? '' });
  }

  protected async onFile(event: Event): Promise<void> {
    const chosen = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(chosen);
    this.problem.set(null);
    this.serverError.set(null);
    if (!chosen) return;
    this.checking.set(true);
    this.problem.set(await checkFile(chosen));
    this.checking.set(false);
    // Suggest the file name as the document name until the user types their own.
    if (!this.form.controls.name.dirty) {
      const base = chosen.name.slice(0, chosen.name.length - extensionOf(chosen.name).length - 1) || chosen.name;
      this.form.controls.name.setValue(base);
    }
  }

  protected submit(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    const file = this.file();
    const needsMetadata = !this.isVersion();
    if (!file || this.problem() || this.checking() || (needsMetadata && this.form.invalid)) return;
    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.serverError.set(null);
    const request = this.isVersion()
      ? this.api.uploadVersion(this.documentId()!, file)
      : this.api.upload(v.clientId, {
          file,
          name: v.name.trim(),
          category: v.category,
          year: Number(v.year),
          periodLabel: v.periodLabel.trim() || undefined,
          tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean),
          description: v.description.trim() || undefined,
          expiryDate: v.expiryDate || undefined,
          requestId: v.requestId || undefined,
        });
    request.subscribe({
      next: (doc) => {
        this.submitting.set(false);
        this.uploaded.emit(doc);
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}
