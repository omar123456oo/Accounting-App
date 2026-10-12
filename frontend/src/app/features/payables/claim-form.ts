import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { isPositive, isValidAmount } from '../../core/money/money';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { LedgerContext } from '../accounting/ledger-context';
import { Client } from '../clients/client.models';
import { ClientsApiService } from '../clients/clients-api.service';
import { BusinessClock } from '../commercial/commercial-api.service';
import { CommercialFormat } from '../commercial/commercial-format';
import { Bearer, ExpenseCategory, ExpenseClaim } from '../commercial/commercial.models';
import { ACCEPT_ATTRIBUTE, FileProblem, MAX_FILE_BYTES, checkFile } from '../documents/file-validation';
import { PayablesApiService } from './payables-api.service';

/**
 * A new expense claim with its receipt. The receipt goes through the same checks as any document upload (size,
 * extension, declared type and the file's first bytes); only a reference to it (name, size, type) is stored here.
 */
@Component({
  selector: 'app-claim-form',
  imports: [ReactiveFormsModule, TranslatePipe, Modal, FieldError],
  template: `
    <app-modal [title]="'commercial.claims.new' | translate" width="40rem" (closed)="cancelled.emit()">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="row g-3">
          <div class="col-12 col-md-4">
            <label for="claim-date" class="form-label">{{ 'commercial.claims.date' | translate }} *</label>
            <input id="claim-date" type="date" class="form-control" formControlName="date" [class.is-invalid]="form.controls.date.invalid && form.controls.date.touched" />
            <app-field-error [control]="form.controls.date" />
          </div>
          <div class="col-12 col-md-4">
            <label for="claim-amount" class="form-label">{{ 'commercial.claims.amount' | translate }} *</label>
            <input id="claim-amount" class="form-control" dir="ltr" inputmode="decimal" formControlName="amount" [class.is-invalid]="form.controls.amount.invalid && form.controls.amount.touched" />
            <app-field-error [control]="form.controls.amount" />
          </div>
          <div class="col-12 col-md-4">
            <label for="claim-category" class="form-label">{{ 'commercial.lines.category' | translate }} *</label>
            <select id="claim-category" class="form-select" formControlName="categoryId" [class.is-invalid]="form.controls.categoryId.invalid && form.controls.categoryId.touched">
              <option value="">{{ 'commercial.lines.choose' | translate }}</option>
              @for (c of categories(); track c.id) {
                <option [value]="c.id">{{ format.name(c) }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.categoryId" />
          </div>
          <div class="col-12">
            <label for="claim-description" class="form-label">{{ 'commercial.claims.description' | translate }} *</label>
            <input id="claim-description" class="form-control" formControlName="description" [class.is-invalid]="form.controls.description.invalid && form.controls.description.touched" />
            <app-field-error [control]="form.controls.description" />
          </div>
          @if (isFirmLedger()) {
            <div class="col-12 col-md-6">
              <label for="claim-bearer" class="form-label">{{ 'commercial.docs.bearer' | translate }}</label>
              <select id="claim-bearer" class="form-select" formControlName="bearer">
                <option value="firm">{{ 'commercial.docs.bearers.firm' | translate }}</option>
                <option value="client_reimbursable">{{ 'commercial.docs.bearers.client_reimbursable' | translate }}</option>
              </select>
            </div>
            @if (form.controls.bearer.value === 'client_reimbursable') {
              <div class="col-12 col-md-6">
                <label for="claim-client" class="form-label">{{ 'commercial.docs.client' | translate }} *</label>
                <select id="claim-client" class="form-select" formControlName="clientId">
                  <option value="">{{ 'commercial.lines.choose' | translate }}</option>
                  @for (c of clients(); track c.id) {
                    <option [value]="c.id">{{ c.legalName }}</option>
                  }
                </select>
                <app-field-error [control]="form.controls.clientId" />
              </div>
            }
          }
          <div class="col-12">
            <label for="claim-receipt" class="form-label">{{ 'commercial.claims.receipt' | translate }} *</label>
            <input id="claim-receipt" type="file" class="form-control" [accept]="accept" [class.is-invalid]="!!problem() || (attempted() && !file())" [attr.aria-describedby]="'claim-receipt-hint'" (change)="onFile($event)" />
            <div id="claim-receipt-hint" class="form-text">{{ 'documents.fileHint' | translate: { max: maxMb } }}</div>
            @if (problem(); as p) {
              <div class="invalid-feedback d-block" role="alert">{{ 'documents.fileError.' + p | translate }}</div>
            } @else if (attempted() && !file()) {
              <div class="invalid-feedback d-block" role="alert">{{ 'validation.required' | translate }}</div>
            }
          </div>
        </div>
        @if (serverError(); as e) {
          <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
        }
        <div class="d-flex justify-content-end gap-2 mt-3">
          <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ 'common.cancel' | translate }}</button>
          <button type="submit" class="btn btn-primary" [disabled]="submitting() || checking()">{{ 'commercial.claims.submit' | translate }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class ClaimForm implements OnInit {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(PayablesApiService);
  private readonly ctx = inject(LedgerContext);
  private readonly clock = inject(BusinessClock);
  private readonly clientsApi = inject(ClientsApiService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = this.ctx.activeId() as string;

  readonly categories = input.required<readonly ExpenseCategory[]>();
  readonly created = output<ExpenseClaim>();
  readonly cancelled = output<void>();

  protected readonly accept = ACCEPT_ATTRIBUTE;
  protected readonly maxMb = MAX_FILE_BYTES / (1024 * 1024);
  protected readonly file = signal<File | null>(null);
  protected readonly problem = signal<FileProblem | null>(null);
  protected readonly checking = signal(false);
  protected readonly submitting = signal(false);
  protected readonly attempted = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly clients = signal<Client[]>([]);
  protected readonly isFirmLedger = computed(() => this.ctx.active()?.type === 'firm');

  protected readonly form = this.fb.group({
    date: ['', Validators.required],
    amount: ['', [Validators.required, (c: { value: string }) => (isValidAmount(String(c.value).trim()) && isPositive(String(c.value).trim()) ? null : { pattern: true })]],
    categoryId: ['', Validators.required],
    description: ['', Validators.required],
    bearer: ['firm' as Bearer],
    clientId: [''],
  });

  ngOnInit(): void {
    this.clock.today(this.ledgerId).subscribe((t) => this.form.patchValue({ date: t }));
    if (this.isFirmLedger()) {
      this.clientsApi
        .list({ pageSize: 100 })
        .pipe(catchError(() => of({ data: [] as Client[], meta: { page: 1, pageSize: 100, total: 0 } })))
        .subscribe((p) => this.clients.set(p.data));
    }
  }

  protected async onFile(event: Event): Promise<void> {
    const chosen = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(chosen);
    this.problem.set(null);
    if (!chosen) return;
    this.checking.set(true);
    this.problem.set(await checkFile(chosen));
    this.checking.set(false);
  }

  protected submit(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    const file = this.file();
    const v = this.form.getRawValue();
    if (v.bearer === 'client_reimbursable' && !v.clientId) this.form.controls.clientId.setErrors({ required: true });
    if (!file || this.problem() || this.checking() || this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.serverError.set(null);
    this.api
      .createClaim(this.ledgerId, { date: v.date, description: v.description.trim(), categoryId: v.categoryId, amount: v.amount.trim(), bearer: v.bearer, ...(v.bearer === 'client_reimbursable' ? { clientId: v.clientId } : {}), receipt: { name: file.name, size: file.size, type: file.type } })
      .subscribe({
        next: (claim) => {
          this.submitting.set(false);
          this.created.emit(claim);
        },
        error: (e: unknown) => {
          this.submitting.set(false);
          for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
          this.serverError.set(apiErrorMessage(e));
        },
      });
  }
}
