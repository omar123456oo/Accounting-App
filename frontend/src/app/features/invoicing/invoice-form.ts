import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, forkJoin, startWith } from 'rxjs';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FieldError } from '../../shared/components/field-error/field-error';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { LedgerContext } from '../accounting/ledger-context';
import { BusinessClock, CommercialApiService } from '../commercial/commercial-api.service';
import { CommercialFormat } from '../commercial/commercial-format';
import { DocLinesEditor } from '../commercial/doc-lines-editor';
import { Invoice, Party, ServiceType, TERMS_DAYS, TERMS_KINDS, TaxRate, TermsKind } from '../commercial/commercial.models';
import { dueDateFor } from '../commercial/doc-calc';
import { lineGroup, toLineInputs, toRawLines, RawLine } from '../commercial/lines-preview';
import { InvoicingApiService } from './invoicing-api.service';

/** Create or edit a draft invoice (or, in quotation mode, a quotation). Amounts shown while typing follow the server's rounding rule. */
@Component({
  selector: 'app-invoice-form',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, FieldError, DocLinesEditor, ConfirmDialog],
  template: `
    @if (notFound()) {
      <div class="alert alert-danger" role="alert">{{ 'commercial.docs.notFound' | translate }}</div>
      <a routerLink="/app/invoicing/invoices">{{ 'commercial.docs.back' | translate }}</a>
    } @else if (loading()) {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    } @else if (notEditable()) {
      <div class="alert alert-warning" role="alert">{{ 'commercial.docs.notEditable' | translate }}</div>
      <a [routerLink]="['/app/invoicing/invoices', id]">{{ 'commercial.docs.back' | translate }}</a>
    } @else {
      <app-page-header [title]="(quotation ? 'commercial.quotations.new' : editing ? 'commercial.docs.ar.edit' : 'commercial.docs.ar.new') | translate" />
      <form [formGroup]="form" (ngSubmit)="save()" novalidate [attr.aria-label]="(quotation ? 'commercial.quotations.new' : 'commercial.docs.ar.new') | translate">
        <div class="row g-3 mb-3">
          <div class="col-12 col-md-4">
            <label for="inv-party" class="form-label">{{ 'commercial.parties.ar.one' | translate }} *</label>
            <select id="inv-party" class="form-select" formControlName="partyId" [class.is-invalid]="form.controls.partyId.invalid && form.controls.partyId.touched" (change)="partyChosen($any($event.target).value)">
              <option value="">{{ 'commercial.lines.choose' | translate }}</option>
              @for (p of customers(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
            <app-field-error [control]="form.controls.partyId" />
          </div>
          <div class="col-6 col-md-2">
            <label for="inv-date" class="form-label">{{ 'commercial.docs.col.date' | translate }} *</label>
            <input id="inv-date" type="date" class="form-control" formControlName="date" [class.is-invalid]="form.controls.date.invalid && form.controls.date.touched" />
            <app-field-error [control]="form.controls.date" />
          </div>
          @if (quotation) {
            <div class="col-6 col-md-2">
              <label for="inv-valid" class="form-label">{{ 'commercial.quotations.validUntil' | translate }} *</label>
              <input id="inv-valid" type="date" class="form-control" formControlName="validUntil" [class.is-invalid]="form.controls.validUntil.invalid && form.controls.validUntil.touched" />
              <app-field-error [control]="form.controls.validUntil" />
            </div>
          } @else {
            <div class="col-6 col-md-3">
              <label for="inv-terms" class="form-label">{{ 'commercial.docs.terms' | translate }}</label>
              <select id="inv-terms" class="form-select" formControlName="termsKind">
                @for (t of termsKinds; track t) {
                  <option [value]="t">{{ 'commercial.docs.termsKinds.' + t | translate }}</option>
                }
              </select>
            </div>
            @if (form.controls.termsKind.value === 'custom') {
              <div class="col-6 col-md-2">
                <label for="inv-days" class="form-label">{{ 'commercial.docs.termsDays' | translate }}</label>
                <input id="inv-days" type="number" min="0" max="365" dir="ltr" class="form-control" formControlName="termsDays" [class.is-invalid]="form.controls.termsDays.invalid" />
                <app-field-error [control]="form.controls.termsDays" />
              </div>
            }
            <div class="col-6 col-md-3">
              <span class="form-label d-block">{{ 'commercial.docs.col.dueDate' | translate }}</span>
              <span id="inv-due" class="form-control-plaintext" dir="ltr">{{ dueDate() ? format.date(dueDate()) : '-' }}</span>
            </div>
          }
        </div>
        @if (needsPeriod()) {
          <div class="row g-3 mb-3">
            <div class="col-12"><div class="alert alert-info mb-0" role="status">{{ 'commercial.docs.deferredNote' | translate }}</div></div>
            <div class="col-6 col-md-3">
              <label for="inv-start" class="form-label">{{ 'commercial.docs.servicePeriodStart' | translate }} *</label>
              <input id="inv-start" type="date" class="form-control" formControlName="servicePeriodStart" />
              <app-field-error [control]="form.controls.servicePeriodStart" />
            </div>
            <div class="col-6 col-md-3">
              <label for="inv-months" class="form-label">{{ 'commercial.docs.servicePeriodMonths' | translate }} *</label>
              <input id="inv-months" type="number" min="1" max="60" dir="ltr" class="form-control" formControlName="servicePeriodMonths" />
              <app-field-error [control]="form.controls.servicePeriodMonths" />
            </div>
          </div>
        }

        <app-doc-lines-editor side="ar" [lines]="lines" [items]="serviceItems()" [rates]="rates()" [date]="date()" />

        <div class="my-3">
          <label for="inv-notes" class="form-label">{{ 'commercial.docs.notes' | translate }}</label>
          <textarea id="inv-notes" class="form-control" rows="2" formControlName="notes"></textarea>
        </div>
        @if (serverError(); as e) {
          <div class="alert alert-danger" role="alert">{{ e }}</div>
        }
        <div class="d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" [disabled]="working()">{{ 'commercial.docs.saveDraft' | translate }}</button>
          <a class="btn btn-outline-secondary" [routerLink]="cancelLink()">{{ 'common.cancel' | translate }}</a>
        </div>
      </form>
    }
    @if (leaving()) {
      <app-confirm-dialog [title]="'clients.unsaved.title' | translate" [message]="'clients.unsaved.message' | translate" [confirmLabel]="'clients.unsaved.leave' | translate" [danger]="true" (confirmed)="answerLeave(true)" (cancelled)="answerLeave(false)" />
    }
  `,
})
export class InvoiceForm implements HasUnsavedChanges {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(InvoicingApiService);
  private readonly ref = inject(CommercialApiService);
  private readonly clock = inject(BusinessClock);
  private today = '';
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly editing = this.id !== null;
  protected readonly quotation = this.route.snapshot.data['mode'] === 'quotation';
  protected readonly termsKinds = TERMS_KINDS;

  protected readonly customers = signal<Party[]>([]);
  protected readonly services = signal<ServiceType[]>([]);
  protected readonly rates = signal<TaxRate[]>([]);
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
    validUntil: [''],
    termsKind: ['net30' as TermsKind],
    termsDays: [30, [Validators.min(0), Validators.max(365)]],
    servicePeriodStart: [''],
    servicePeriodMonths: [12],
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
  protected readonly serviceItems = computed(() => this.services().map((s) => ({ id: s.id, label: this.format.name(s) })));
  protected readonly needsPeriod = computed(() => {
    this.changes();
    const chosen = new Set((this.lines.getRawValue() as RawLine[]).map((l) => l.itemId));
    return this.services().some((s) => chosen.has(s.id) && s.recognition === 'deferred_over_period');
  });
  protected readonly cancelLink = computed(() => (this.id ? ['/app/invoicing/invoices', this.id] : this.quotation ? ['/app/invoicing/quotations'] : ['/app/invoicing/invoices']));

  constructor() {
    forkJoin({ customers: this.ref.parties(this.ledgerId, 'ar'), services: this.ref.serviceTypes(this.ledgerId), rates: this.ref.taxRates(), today: this.clock.today(this.ledgerId) }).subscribe({
      next: ({ customers, services, rates, today }) => {
        this.today = today;
        this.customers.set(customers);
        this.services.set(services);
        this.rates.set(rates);
        this.afterReference();
      },
      error: () => {
        this.serverError.set('clients.loadFailed');
        this.loading.set(false);
      },
    });
  }

  private afterReference(): void {
    if (this.id) {
      this.api.get(this.ledgerId, this.id).subscribe({
        next: (inv) => this.fill(inv),
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
      return;
    }
    const customerId = this.route.snapshot.queryParamMap.get('customerId') ?? '';
    this.form.patchValue({ date: this.today, validUntil: '' });
    if (customerId) {
      this.form.controls.partyId.setValue(customerId);
      this.partyChosen(customerId);
    }
    this.form.markAsPristine();
    this.loading.set(false);
  }

  private fill(inv: Invoice): void {
    if (inv.status !== 'draft') this.notEditable.set(true);
    this.form.patchValue({ partyId: inv.partyId, date: inv.date, termsKind: inv.termsKind, termsDays: inv.termsDays, servicePeriodStart: inv.servicePeriodStart ?? '', servicePeriodMonths: inv.servicePeriodMonths ?? 12, notes: inv.notes ?? '' });
    this.lines.clear();
    for (const l of toRawLines(inv.lines)) this.lines.push(lineGroup(l));
    this.form.markAsPristine();
    this.loading.set(false);
  }

  /** The customer's usual terms become the default; the user can still change them. */
  protected partyChosen(id: string): void {
    const customer = this.customers().find((c) => c.id === id);
    if (!customer) return;
    const kind = (Object.entries(TERMS_DAYS).find(([, days]) => days === customer.paymentTermsDays)?.[0] ?? 'custom') as TermsKind;
    this.form.patchValue({ termsKind: kind, termsDays: customer.paymentTermsDays });
  }

  protected save(): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || this.working()) return;
    if (this.quotation && !v.validUntil) {
      this.form.controls.validUntil.setErrors({ required: true });
      return;
    }
    const lines = toLineInputs(this.lines.getRawValue() as RawLine[], 'ar');
    this.working.set(true);
    this.serverError.set(null);
    let request: Observable<{ id: string }>;
    if (this.quotation) {
      request = this.api.createQuotation(this.ledgerId, { partyId: v.partyId, date: v.date, validUntil: v.validUntil, lines, ...(v.notes.trim() ? { notes: v.notes.trim() } : {}) });
    } else {
      const body = { partyId: v.partyId, date: v.date, termsKind: v.termsKind, ...(v.termsKind === 'custom' ? { termsDays: Number(v.termsDays) } : {}), lines, notes: v.notes.trim(), ...(this.needsPeriod() ? { servicePeriodStart: v.servicePeriodStart, servicePeriodMonths: Number(v.servicePeriodMonths) } : {}) };
      request = this.id ? this.api.update(this.ledgerId, this.id, body) : this.api.create(this.ledgerId, body);
    }
    request.subscribe({
      next: (saved) => {
        this.done = true;
        void this.router.navigate(this.quotation ? ['/app/invoicing/quotations'] : ['/app/invoicing/invoices', saved.id]);
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
