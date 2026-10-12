import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../../core/http/api-errors';
import { toPlain } from '../../../core/money/money';
import { FieldError } from '../../../shared/components/field-error/field-error';
import { Modal } from '../../../shared/components/modal/modal';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { LedgerContext } from '../../accounting/ledger-context';
import { CommercialApiService } from '../commercial-api.service';
import { CommercialFormat } from '../commercial-format';
import { ExpenseCategory, RECOGNITIONS, Recognition, ServiceType } from '../commercial.models';

type Row = ServiceType | ExpenseCategory;

/** Service types (with the revenue recognition policy) or expense categories (with a monthly budget), chosen by route data. */
@Component({
  selector: 'app-catalogue-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader, Modal, FieldError],
  template: `
    <app-page-header [title]="'commercial.settings.' + kind | translate">
      @if (canManage) {
        <button type="button" class="btn btn-primary" (click)="open(null)">{{ 'commercial.catalogue.new' | translate }}</button>
      }
    </app-page-header>
    <p class="text-body-secondary">{{ 'commercial.catalogue.' + kind + 'Intro' | translate }}</p>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rows(); as list) {
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ 'commercial.settings.' + kind | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'commercial.catalogue.code' | translate }}</th>
              <th scope="col">{{ 'commercial.catalogue.name' | translate }}</th>
              @if (isService) {
                <th scope="col">{{ 'commercial.catalogue.recognition' | translate }}</th>
                <th scope="col">{{ 'commercial.catalogue.kind' | translate }}</th>
              } @else {
                <th scope="col">{{ 'commercial.catalogue.monthlyBudget' | translate }}</th>
              }
              <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of list; track r.id) {
              <tr>
                <td dir="ltr" class="text-start">{{ r.code }}</td>
                <td>{{ format.name(r) }}</td>
                @if (isService) {
                  <td>{{ 'commercial.recognition.' + asService(r).recognition | translate }}</td>
                  <td>{{ 'commercial.catalogue.kinds.' + asService(r).kind | translate }}</td>
                } @else {
                  <td dir="ltr" class="text-end">{{ asCategory(r).monthlyBudget ? format.amount(asCategory(r).monthlyBudget!) : ('commercial.catalogue.noBudget' | translate) }}</td>
                }
                <td class="text-end">
                  @if (canManage) {
                    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="open(r)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ r.code }}</span></button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }

    @if (editing() !== undefined) {
      <app-modal [title]="(editing() ? 'common.edit' : 'commercial.catalogue.new') | translate" (closed)="editing.set(undefined)">
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="row g-3">
            <div class="col-12">
              <label for="cat-code" class="form-label">{{ 'commercial.catalogue.code' | translate }} *</label>
              <input id="cat-code" class="form-control" dir="ltr" formControlName="code" [class.is-invalid]="form.controls.code.invalid && form.controls.code.touched" />
              <app-field-error [control]="form.controls.code" />
            </div>
            <div class="col-12 col-md-6">
              <label for="cat-ar" class="form-label">{{ 'commercial.catalogue.nameAr' | translate }} *</label>
              <input id="cat-ar" class="form-control" dir="rtl" formControlName="nameAr" [class.is-invalid]="form.controls.nameAr.invalid && form.controls.nameAr.touched" />
              <app-field-error [control]="form.controls.nameAr" />
            </div>
            <div class="col-12 col-md-6">
              <label for="cat-en" class="form-label">{{ 'commercial.catalogue.nameEn' | translate }} *</label>
              <input id="cat-en" class="form-control" dir="ltr" formControlName="nameEn" [class.is-invalid]="form.controls.nameEn.invalid && form.controls.nameEn.touched" />
              <app-field-error [control]="form.controls.nameEn" />
            </div>
            @if (isService) {
              <div class="col-12 col-md-6">
                <label for="cat-rec" class="form-label">{{ 'commercial.catalogue.recognition' | translate }}</label>
                <select id="cat-rec" class="form-select" formControlName="recognition">
                  @for (r of recognitions; track r) {
                    <option [value]="r">{{ 'commercial.recognition.' + r | translate }}</option>
                  }
                </select>
              </div>
              <div class="col-12 col-md-6">
                <label for="cat-kind" class="form-label">{{ 'commercial.catalogue.kind' | translate }}</label>
                <select id="cat-kind" class="form-select" formControlName="kind">
                  <option value="standard">{{ 'commercial.catalogue.kinds.standard' | translate }}</option>
                  <option value="reimbursement">{{ 'commercial.catalogue.kinds.reimbursement' | translate }}</option>
                </select>
              </div>
            } @else {
              <div class="col-12">
                <label for="cat-budget" class="form-label">{{ 'commercial.catalogue.monthlyBudget' | translate }}</label>
                <input id="cat-budget" class="form-control" dir="ltr" inputmode="decimal" formControlName="monthlyBudget" [class.is-invalid]="form.controls.monthlyBudget.invalid && form.controls.monthlyBudget.touched" />
                <app-field-error [control]="form.controls.monthlyBudget" />
              </div>
            }
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
export class CataloguePage {
  private readonly api = inject(CommercialApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly format = inject(CommercialFormat);
  protected readonly canManage = inject(AuthService).can('mappings.manage');
  protected readonly kind = inject(ActivatedRoute).snapshot.data['kind'] as 'service-types' | 'expense-categories';
  protected readonly isService = this.kind === 'service-types';
  protected readonly recognitions = RECOGNITIONS;
  protected readonly rows = signal<Row[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly editing = signal<Row | null | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly asService = (r: Row) => r as ServiceType;
  protected readonly asCategory = (r: Row) => r as ExpenseCategory;


  protected readonly form = this.fb.group({
    code: ['', Validators.required],
    nameAr: ['', Validators.required],
    nameEn: ['', Validators.required],
    recognition: ['on_issue' as Recognition],
    kind: ['standard' as 'standard' | 'reimbursement'],
    monthlyBudget: ['', Validators.pattern(/^(\d{1,15}(\.\d{1,4})?)?$/)],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    const request: Observable<Row[]> = this.isService ? this.api.serviceTypes(this.ledgerId) : this.api.categories(this.ledgerId);
    request.subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }

  protected open(row: Row | null): void {
    this.serverError.set(null);
    const s = row as ServiceType | null;
    const c = row as ExpenseCategory | null;
    this.form.reset({ code: row?.code ?? '', nameAr: row?.nameAr ?? '', nameEn: row?.nameEn ?? '', recognition: s?.recognition ?? 'on_issue', kind: s?.kind ?? 'standard', monthlyBudget: c?.monthlyBudget ? toPlain(c.monthlyBudget) : '' });
    this.editing.set(row);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const base = { code: v.code.trim(), nameAr: v.nameAr.trim(), nameEn: v.nameEn.trim() };
    const current = this.editing();
    this.saving.set(true);
    this.serverError.set(null);
    let request: Observable<unknown>;
    if (this.isService) {
      const input = { ...base, recognition: v.recognition, kind: v.kind };
      request = current ? this.api.updateServiceType(this.ledgerId, current.id, input) : this.api.createServiceType(this.ledgerId, input);
    } else {
      const input = { ...base, monthlyBudget: v.monthlyBudget.trim() };
      request = current ? this.api.updateCategory(this.ledgerId, current.id, input) : this.api.createCategory(this.ledgerId, input);
    }
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
