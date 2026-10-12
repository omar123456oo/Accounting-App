import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { isValidPercent } from '../../../core/money/money';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { Modal } from '../../../shared/components/modal/modal';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { CommercialApiService } from '../commercial-api.service';
import { CommercialFormat } from '../commercial-format';
import { TAX_APPROVALS, TaxApproval, TaxRate, TaxRateInput } from '../commercial.models';

const TONE = { draft: 'warning', professionally_verified: 'success', retired: 'secondary' } as const;

/**
 * Versioned tax rates. The system ships no real rate: only clearly marked DEMO drafts. A specialist enters the
 * real values, the legal source and the verification; changing a rate adds a version and never touches a
 * document that was already issued (it keeps its own snapshot).
 */
@Component({
  selector: 'app-tax-rates-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, StatusBadge, Modal, FieldError, HasPermissionDirective],
  template: `
    <app-page-header [title]="'commercial.settings.tax-rates' | translate">
      <button *appHasPermission="'tax.rates.manage'" type="button" class="btn btn-primary" (click)="open(null)">{{ 'commercial.tax.new' | translate }}</button>
    </app-page-header>
    <div id="tax-unverified-banner" class="alert alert-warning" role="status"><strong>{{ 'commercial.tax.unverifiedBanner' | translate }}</strong></div>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rates(); as list) {
      @if (list.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.tax.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'commercial.settings.tax-rates' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.tax.fields.code' | translate }}</th>
                <th scope="col">{{ 'commercial.tax.fields.name' | translate }}</th>
                <th scope="col">{{ 'commercial.tax.fields.rate' | translate }}</th>
                <th scope="col">{{ 'commercial.tax.fields.effective' | translate }}</th>
                <th scope="col">{{ 'commercial.tax.fields.status' | translate }}</th>
                <th scope="col">{{ 'commercial.tax.fields.version' | translate }}</th>
                <th scope="col">{{ 'commercial.tax.fields.legalSource' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of list; track r.id) {
                <tr>
                  <td dir="ltr" class="text-start">{{ r.code }}@if (r.isDemo) { <span class="badge text-bg-warning ms-1">{{ 'commercial.tax.demo' | translate }}</span> }</td>
                  <td>{{ r.name }}</td>
                  <td dir="ltr" class="text-end">{{ r.rate }}%</td>
                  <td>{{ format.date(r.effectiveFrom) }}@if (r.effectiveTo) { - {{ format.date(r.effectiveTo) }} }</td>
                  <td>
                    <app-status-badge [label]="'commercial.tax.approval.' + r.approvalStatus | translate" [tone]="tone[r.approvalStatus]" />
                    @if (r.lastVerifiedAt) {
                      <span class="d-block small text-body-secondary">{{ 'commercial.tax.verifiedAt' | translate: { date: format.date(r.lastVerifiedAt) } }}</span>
                    }
                  </td>
                  <td dir="ltr" class="text-end">{{ r.version }}</td>
                  <td>{{ r.legalSource }}</td>
                  <td class="text-end">
                    <button *appHasPermission="'tax.rates.manage'" type="button" class="btn btn-outline-secondary btn-sm" (click)="open(r)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ r.code }}</span></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }

    @if (editing() !== undefined) {
      <app-modal [title]="(editing() ? 'commercial.tax.edit' : 'commercial.tax.new') | translate" width="40rem" (closed)="editing.set(undefined)">
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (editing()) {
            <p class="small text-body-secondary">{{ 'commercial.tax.versionNote' | translate }}</p>
          }
          <div class="row g-3">
            <div class="col-12 col-md-4">
              <label for="tx-code" class="form-label">{{ 'commercial.tax.fields.code' | translate }} *</label>
              <input id="tx-code" class="form-control" dir="ltr" formControlName="code" [class.is-invalid]="form.controls.code.invalid && form.controls.code.touched" />
              <app-field-error [control]="form.controls.code" />
            </div>
            <div class="col-12 col-md-8">
              <label for="tx-name" class="form-label">{{ 'commercial.tax.fields.name' | translate }} *</label>
              <input id="tx-name" class="form-control" formControlName="name" [class.is-invalid]="form.controls.name.invalid && form.controls.name.touched" />
              <app-field-error [control]="form.controls.name" />
            </div>
            <div class="col-12 col-md-4">
              <label for="tx-rate" class="form-label">{{ 'commercial.tax.fields.rate' | translate }} (%) *</label>
              <input id="tx-rate" class="form-control" dir="ltr" inputmode="decimal" formControlName="rate" [class.is-invalid]="form.controls.rate.invalid && form.controls.rate.touched" />
              <app-field-error [control]="form.controls.rate" />
            </div>
            <div class="col-6 col-md-4">
              <label for="tx-from" class="form-label">{{ 'commercial.tax.fields.effectiveFrom' | translate }} *</label>
              <input id="tx-from" type="date" class="form-control" formControlName="effectiveFrom" [class.is-invalid]="form.controls.effectiveFrom.invalid && form.controls.effectiveFrom.touched" />
              <app-field-error [control]="form.controls.effectiveFrom" />
            </div>
            <div class="col-6 col-md-4">
              <label for="tx-to" class="form-label">{{ 'commercial.tax.fields.effectiveTo' | translate }}</label>
              <input id="tx-to" type="date" class="form-control" formControlName="effectiveTo" />
              <app-field-error [control]="form.controls.effectiveTo" />
            </div>
            <div class="col-12">
              <label for="tx-source" class="form-label">{{ 'commercial.tax.fields.legalSource' | translate }} *</label>
              <input id="tx-source" class="form-control" formControlName="legalSource" [class.is-invalid]="form.controls.legalSource.invalid && form.controls.legalSource.touched" />
              <app-field-error [control]="form.controls.legalSource" />
            </div>
            <div class="col-12 col-md-6">
              <label for="tx-status" class="form-label">{{ 'commercial.tax.fields.status' | translate }} *</label>
              <select id="tx-status" class="form-select" formControlName="approvalStatus">
                @for (a of approvals; track a) {
                  <option [value]="a">{{ 'commercial.tax.approval.' + a | translate }}</option>
                }
              </select>
            </div>
            <div class="col-12 col-md-6">
              <label for="tx-verified" class="form-label">{{ 'commercial.tax.fields.lastVerifiedAt' | translate }}</label>
              <input id="tx-verified" type="date" class="form-control" formControlName="lastVerifiedAt" />
              <app-field-error [control]="form.controls.lastVerifiedAt" />
            </div>
          </div>
          @if (serverError(); as e) {
            <div class="alert alert-danger mt-3" role="alert">{{ e }}</div>
          }
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="editing.set(undefined)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class TaxRatesPage {
  private readonly api = inject(CommercialApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly format = inject(CommercialFormat);
  protected readonly tone = TONE;
  protected readonly approvals = TAX_APPROVALS;
  protected readonly rates = signal<TaxRate[] | null>(null);
  protected readonly failed = signal(false);
  /** undefined: closed. null: creating. A rate: editing it. */
  protected readonly editing = signal<TaxRate | null | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    rate: ['', [Validators.required, (c: { value: string }) => (isValidPercent(String(c.value).trim()) ? null : { pattern: true })]],
    effectiveFrom: ['', Validators.required],
    effectiveTo: [''],
    legalSource: ['', Validators.required],
    approvalStatus: ['draft' as TaxApproval],
    lastVerifiedAt: [''],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.taxRates().subscribe({ next: (r) => this.rates.set(r), error: () => this.failed.set(true) });
  }

  protected open(rate: TaxRate | null): void {
    this.serverError.set(null);
    this.form.reset({ code: rate?.code ?? '', name: rate?.name ?? '', rate: rate?.rate ?? '', effectiveFrom: rate?.effectiveFrom ?? '', effectiveTo: rate?.effectiveTo ?? '', legalSource: rate?.legalSource ?? '', approvalStatus: rate?.approvalStatus ?? 'draft', lastVerifiedAt: rate?.lastVerifiedAt ?? '' });
    this.editing.set(rate);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const input: TaxRateInput = { code: v.code.trim(), name: v.name.trim(), rate: v.rate.trim(), effectiveFrom: v.effectiveFrom, legalSource: v.legalSource.trim(), approvalStatus: v.approvalStatus, ...(v.effectiveTo ? { effectiveTo: v.effectiveTo } : {}), ...(v.lastVerifiedAt ? { lastVerifiedAt: v.lastVerifiedAt } : {}) };
    const current = this.editing();
    this.saving.set(true);
    this.serverError.set(null);
    const request = current ? this.api.updateTaxRate(current.id, { ...input, effectiveTo: v.effectiveTo, lastVerifiedAt: v.lastVerifiedAt }) : this.api.createTaxRate(input);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(undefined);
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        for (const [field, message] of Object.entries(fieldErrors(e))) this.form.get(field)?.setErrors({ server: message });
        this.serverError.set(apiErrorMessage(e));
      },
    });
  }
}
