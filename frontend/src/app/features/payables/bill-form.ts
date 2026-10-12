import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, forkJoin, of, startWith } from 'rxjs';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../shared/components/field-error/field-error';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { LedgerContext } from '../accounting/ledger-context';
import { Client } from '../clients/client.models';
import { ClientsApiService } from '../clients/clients-api.service';
import { BusinessClock, CommercialApiService } from '../commercial/commercial-api.service';
import { CommercialFormat } from '../commercial/commercial-format';
import { Bearer, Bill, ExpenseCategory, Party, TERMS_DAYS, TERMS_KINDS, TaxRate, TermsKind } from '../commercial/commercial.models';
import { dueDateFor } from '../commercial/doc-calc';
import { DocLinesEditor } from '../commercial/doc-lines-editor';
import { RawLine, lineGroup, toLineInputs, toRawLines } from '../commercial/lines-preview';
import { PayablesApiService } from './payables-api.service';

/** Create or edit a draft supplier bill. A client-reimbursable bill belongs to the firm ledger and names the client it is paid for. */
@Component({
  selector: 'app-bill-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, FieldError, DocLinesEditor, ConfirmDialog],
  template: `
    @if (notFound()) {
      <div class="alert alert-danger" role="alert">{{ 'commercial.docs.notFound' | translate }}</div>
      <a routerLink="/app/payables/bills">{{ 'commercial.docs.back' | translate }}</a>
    } @else if (loading()) {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    } @else if (notEditable()) {
      <div class="alert alert-warning" role="alert">{{ 'commercial.docs.notEditable' | translate }}</div>
      <a [routerLink]="['/app/payables/bills', id]">{{ 'commercial.docs.back' | translate }}</a>
    } @else {
      <app-page-header [title]="(editing ? 'commercial.docs.ap.edit' : 'commercial.docs.ap.new') | translate" />
      <form [formGroup]="form" (ngSubmit)="save()" novalidate [attr.aria-label]="'commercial.docs.ap.new' | translate">
        <div class="row g-3 mb-3">
          <div class="col-12 col-md-4">
            <label for="bill-party" class="form-label">{{ 'commercial.parties.ap.one' | translate }} *</label>
            <select id="bill-party" class="form-select" formControlName="partyId" [class.is-invalid]="form.controls.partyId.invalid && form.controls.partyId.touched" (change)="partyChosen($any($event.target).value)">
              <option value="">{{ 'commercial.lines.choose' | translate }}</option>
              @for (p of suppliers(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.partyId" />
          </div>
          <div class="col-6 col-md-2">
            <label for="bill-date" class="form-label">{{ 'commercial.docs.col.date' | translate }} *</label>
            <input id="bill-date" type="date" class="form-control" formControlName="date" [class.is-invalid]="form.controls.date.invalid && form.controls.date.touched" />
            <app-field-error [control]="form.controls.date" />
          </div>
          <div class="col-6 col-md-3">
            <label for="bill-terms" class="form-label">{{ 'commercial.docs.terms' | translate }}</label>
            <select id="bill-terms" class="form-select" formControlName="termsKind">
              @for (t of termsKinds; track t) {
                <option [value]="t">{{ 'commercial.docs.termsKinds.' + t | translate }}</option>
              }
            </select>
          </div>
          @if (form.controls.termsKind.value === 'custom') {
            <div class="col-6 col-md-2">
              <label for="bill-days" class="form-label">{{ 'commercial.docs.termsDays' | translate }}</label>
              <input id="bill-days" type="number" min="0" max="365" dir="ltr" class="form-control" formControlName="termsDays" />
            </div>
          }
          <div class="col-6 col-md-2">
            <span class="form-label d-block">{{ 'commercial.docs.col.dueDate' | translate }}</span>
            <span id="bill-due" class="form-control-plaintext" dir="ltr">{{ dueDate() ? format.date(dueDate()) : '-' }}</span>
          </div>
          <div class="col-12 col-md-4">
            <label for="bill-ref" class="form-label">{{ 'commercial.docs.supplierInvoiceNo' | translate }}</label>
            <input id="bill-ref" class="form-control" dir="ltr" formControlName="supplierInvoiceNo" />
          </div>
          <div class="col-12 col-md-4">
            <label for="bill-bearer" class="form-label">{{ 'commercial.docs.bearer' | translate }}</label>
            <select id="bill-bearer" class="form-select" formControlName="bearer">
              <option value="firm">{{ 'commercial.docs.bearers.firm' | translate }}</option>
              @if (isFirmLedger()) {
                <option value="client_reimbursable">{{ 'commercial.docs.bearers.client_reimbursable' | translate }}</option>
              }
            </select>
            <div class="form-text">{{ 'commercial.docs.bearerHint' | translate }}</div>
          </div>
          @if (form.controls.bearer.value === 'client_reimbursable') {
            <div class="col-12 col-md-4">
              <label for="bill-client" class="form-label">{{ 'commercial.docs.client' | translate }} *</label>
              <select id="bill-client" class="form-select" formControlName="clientId" [class.is-invalid]="form.controls.clientId.invalid && form.controls.clientId.touched">
                <option value="">{{ 'commercial.lines.choose' | translate }}</option>
                @for (c of clients(); track c.id) {
                  <option [value]="c.id">{{ c.legalName }}</option>
                }
              </select>
              <app-field-error [control]="form.controls.clientId" />
            </div>
          }
        </div>

        <app-doc-lines-editor side="ap" [lines]="lines" [items]="categoryItems()" [rates]="rates()" [date]="date()" />

        <div class="my-3">
          <label for="bill-notes" class="form-label">{{ 'commercial.docs.notes' | translate }}</label>
          <textarea id="bill-notes" class="form-control" rows="2" formControlName="notes"></textarea>
        </div>
        @if (serverError(); as e) {
          <div class="alert alert-danger" role="alert">{{ e }}</div>
        }
        <div class="d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" [disabled]="working()">{{ 'commercial.docs.saveDraft' | translate }}</button>
          <a class="btn btn-outline-secondary" [routerLink]="id ? ['/app/payables/bills', id] : ['/app/payables/bills']">{{ 'common.cancel' | translate }}</a>
        </div>
      </form>
    }
    @if (leaving()) {
      <app-confirm-dialog [title]="'clients.unsaved.title' | translate" [message]="'clients.unsaved.message' | translate" [confirmLabel]="'clients.unsaved.leave' | translate" [danger]="true" (confirmed)="answerLeave(true)" (cancelled)="answerLeave(false)" />
    }
  `,
})
export class BillForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(PayablesApiService);
  private readonly ref = inject(CommercialApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ctx = inject(LedgerContext);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = this.ctx.activeId() as string;
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly editing = this.id !== null;
  protected readonly termsKinds = TERMS_KINDS;

  protected readonly suppliers = signal<Party[]>([]);
  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly rates = signal<TaxRate[]>([]);
  protected readonly clients = signal<Client[]>([]);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly notEditable = signal(false);
  protected readonly working = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly leaving = signal(false);
  private resolveLeave: ((ok: boolean) => void) | null = null;
  private done = false;

  protected readonly form = this.fb.group({
    partyId: ['', Validators.required],
    date: ['', Validators.required],
    termsKind: ['net30' as TermsKind],
    termsDays: [30, [Validators.min(0), Validators.max(365)]],
    supplierInvoiceNo: [''],
    bearer: ['firm' as Bearer],
    clientId: [''],
    notes: [''],
    lines: this.fb.array([lineGroup()]),
  });
  protected readonly lines = this.form.controls.lines as unknown as FormArray<FormGroup>;
  private readonly changes = toSignal(this.form.valueChanges.pipe(startWith(null)));
  protected readonly date = computed(() => (this.changes(), this.form.controls.date.value));
  protected readonly dueDate = computed(() => {
    this.changes();
    const v = this.form.getRawValue();
    return v.date ? dueDateFor(v.date, v.termsKind, Number(v.termsDays)) : '';
  });
  protected readonly categoryItems = computed(() => this.categories().map((c) => ({ id: c.id, label: this.format.name(c) })));
  protected readonly isFirmLedger = computed(() => this.ctx.active()?.type === 'firm');

  constructor() {
    forkJoin({
      suppliers: this.ref.parties(this.ledgerId, 'ap'),
      categories: this.ref.categories(this.ledgerId),
      rates: this.ref.taxRates(),
      today: inject(BusinessClock).today(this.ledgerId),
      clients: inject(ClientsApiService)
        .list({ pageSize: 100 })
        .pipe(catchError(() => of({ data: [] as Client[], meta: { page: 1, pageSize: 100, total: 0 } }))),
    }).subscribe({
      next: ({ suppliers, categories, rates, today, clients }) => {
        this.suppliers.set(suppliers);
        this.categories.set(categories);
        this.rates.set(rates);
        this.clients.set(clients.data);
        if (this.id) {
          this.api.get(this.ledgerId, this.id).subscribe({
            next: (bill) => this.fill(bill),
            error: () => {
              this.notFound.set(true);
              this.loading.set(false);
            },
          });
          return;
        }
        this.form.patchValue({ date: today });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: () => {
        this.serverError.set('clients.loadFailed');
        this.loading.set(false);
      },
    });
  }

  private fill(bill: Bill): void {
    if (bill.status !== 'draft') this.notEditable.set(true);
    this.form.patchValue({ partyId: bill.partyId, date: bill.date, termsKind: bill.termsKind, termsDays: bill.termsDays, supplierInvoiceNo: bill.supplierInvoiceNo ?? '', bearer: bill.bearer, clientId: bill.clientId ?? '', notes: bill.notes ?? '' });
    this.lines.clear();
    for (const l of toRawLines(bill.lines)) this.lines.push(lineGroup(l));
    this.form.markAsPristine();
    this.loading.set(false);
  }

  protected partyChosen(id: string): void {
    const supplier = this.suppliers().find((s) => s.id === id);
    if (!supplier) return;
    const kind = (Object.entries(TERMS_DAYS).find(([, days]) => days === supplier.paymentTermsDays)?.[0] ?? 'custom') as TermsKind;
    this.form.patchValue({ termsKind: kind, termsDays: supplier.paymentTermsDays });
  }

  protected save(): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (v.bearer === 'client_reimbursable' && !v.clientId) {
      this.form.controls.clientId.setErrors({ required: true });
    }
    if (this.form.invalid || this.working()) return;
    const body = {
      partyId: v.partyId,
      date: v.date,
      termsKind: v.termsKind,
      ...(v.termsKind === 'custom' ? { termsDays: Number(v.termsDays) } : {}),
      supplierInvoiceNo: v.supplierInvoiceNo.trim(),
      bearer: v.bearer,
      ...(v.bearer === 'client_reimbursable' ? { clientId: v.clientId } : {}),
      notes: v.notes.trim(),
      lines: toLineInputs(this.lines.getRawValue() as RawLine[], 'ap'),
    };
    this.working.set(true);
    this.serverError.set(null);
    (this.id ? this.api.update(this.ledgerId, this.id, body) : this.api.create(this.ledgerId, body)).subscribe({
      next: (saved) => {
        this.done = true;
        void this.router.navigate(['/app/payables/bills', saved.id]);
      },
      error: (e: unknown) => {
        this.working.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.done || !this.form.dirty) return true;
    this.leaving.set(true);
    return new Promise<boolean>((resolve) => (this.resolveLeave = resolve));
  }

  protected answerLeave(ok: boolean): void {
    this.leaving.set(false);
    this.resolveLeave?.(ok);
    this.resolveLeave = null;
  }
}
