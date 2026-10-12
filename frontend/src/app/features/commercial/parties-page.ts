import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { FieldError } from '../../shared/components/field-error/field-error';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { LedgerContext } from '../accounting/ledger-context';
import { Client } from '../clients/client.models';
import { ClientsApiService } from '../clients/clients-api.service';
import { CommercialApiService } from './commercial-api.service';
import { CommercialFormat } from './commercial-format';
import { Party, PartyInput, Side } from './commercial.models';

/** Customers (receivables) or suppliers (payables) of the active ledger. A firm-ledger customer may be linked to one of the firm's clients. */
@Component({
  selector: 'app-parties-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, PageHeader, StatusBadge, Modal, FieldError],
  template: `
    <app-page-header [title]="'commercial.parties.' + side + '.title' | translate">
      @if (canManage) {
        <button type="button" class="btn btn-primary" (click)="open(null)">{{ 'commercial.parties.' + side + '.new' | translate }}</button>
      }
    </app-page-header>
    <form class="row g-2 align-items-end mb-3" role="search" (submit)="search($event, q.value)">
      <div class="col-12 col-md-4">
        <label for="party-q" class="form-label">{{ 'commercial.parties.search' | translate }}</label>
        <input #q id="party-q" type="search" class="form-control" />
      </div>
      <div class="col-auto">
        <div class="form-check mb-2">
          <input id="party-archived" type="checkbox" class="form-check-input" [checked]="withArchived()" (change)="toggleArchived($any($event.target).checked)" />
          <label for="party-archived" class="form-check-label">{{ 'commercial.parties.showArchived' | translate }}</label>
        </div>
      </div>
      <div class="col-auto"><button type="submit" class="btn btn-secondary">{{ 'clients.searchButton' | translate }}</button></div>
    </form>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rows(); as list) {
      @if (list.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.parties.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'commercial.parties.' + side + '.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.parties.name' | translate }}</th>
                <th scope="col">{{ 'commercial.parties.terms' | translate }}</th>
                <th scope="col">{{ 'commercial.parties.open.' + side | translate }}</th>
                <th scope="col">{{ 'commercial.parties.credit.' + side | translate }}</th>
                <th scope="col">{{ 'commercial.parties.status' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (p of list; track p.id) {
                <tr>
                  <td>
                    {{ p.name }}
                    @if (p.clientName) {
                      <span class="d-block small text-body-secondary">{{ 'commercial.parties.linkedClient' | translate: { name: p.clientName } }}</span>
                    }
                  </td>
                  <td>{{ 'commercial.parties.termsDays' | translate: { days: p.paymentTermsDays } }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(p.openBalance) }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(p.creditBalance) }}</td>
                  <td><app-status-badge [label]="(p.archived ? 'commercial.parties.archived' : 'commercial.parties.active') | translate" [tone]="p.archived ? 'secondary' : 'success'" /></td>
                  <td class="text-end">
                    <span class="d-inline-flex flex-wrap gap-1">
                      <a class="btn btn-outline-secondary btn-sm" [routerLink]="[statements, p.id]">{{ 'commercial.statement.title' | translate }}<span class="visually-hidden"> {{ p.name }}</span></a>
                      @if (canManage) {
                        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="open(p)">{{ 'common.edit' | translate }}<span class="visually-hidden"> {{ p.name }}</span></button>
                      }
                    </span>
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
      <app-modal [title]="(editing() ? 'common.edit' : 'commercial.parties.' + side + '.new') | translate" width="38rem" (closed)="editing.set(undefined)">
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="row g-3">
            <div class="col-12">
              <label for="party-name" class="form-label">{{ 'commercial.parties.name' | translate }} *</label>
              <input id="party-name" class="form-control" formControlName="name" [class.is-invalid]="form.controls.name.invalid && form.controls.name.touched" />
              <app-field-error [control]="form.controls.name" />
            </div>
            <div class="col-12 col-md-6">
              <label for="party-email" class="form-label">{{ 'commercial.parties.email' | translate }}</label>
              <input id="party-email" type="email" dir="ltr" class="form-control" formControlName="email" [class.is-invalid]="form.controls.email.invalid && form.controls.email.touched" />
              <app-field-error [control]="form.controls.email" />
            </div>
            <div class="col-12 col-md-6">
              <label for="party-phone" class="form-label">{{ 'commercial.parties.phone' | translate }}</label>
              <input id="party-phone" dir="ltr" class="form-control" formControlName="phone" />
            </div>
            <div class="col-12 col-md-6">
              <label for="party-tax" class="form-label">{{ 'commercial.parties.taxNo' | translate }}</label>
              <input id="party-tax" dir="ltr" class="form-control" inputmode="numeric" formControlName="taxRegistrationNo" [class.is-invalid]="form.controls.taxRegistrationNo.invalid && form.controls.taxRegistrationNo.touched" />
              <app-field-error [control]="form.controls.taxRegistrationNo" />
            </div>
            <div class="col-12 col-md-6">
              <label for="party-terms" class="form-label">{{ 'commercial.parties.terms' | translate }} *</label>
              <input id="party-terms" type="number" min="0" max="365" dir="ltr" class="form-control" formControlName="paymentTermsDays" />
              <div class="form-text">{{ 'commercial.parties.termsHint' | translate }}</div>
            </div>
            @if (canLinkClient()) {
              <div class="col-12">
                <label for="party-client" class="form-label">{{ 'commercial.parties.client' | translate }}</label>
                <select id="party-client" class="form-select" formControlName="clientId">
                  <option value="">{{ 'commercial.parties.noClient' | translate }}</option>
                  @for (c of clients(); track c.id) {
                    <option [value]="c.id">{{ c.legalName }}</option>
                  }
                </select>
                <app-field-error [control]="form.controls.clientId" />
              </div>
            }
            @if (editing()) {
              <div class="col-12">
                <div class="form-check">
                  <input id="party-archive" type="checkbox" class="form-check-input" formControlName="archived" />
                  <label for="party-archive" class="form-check-label">{{ 'commercial.parties.archive' | translate }}</label>
                </div>
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
export class PartiesPage {
  private readonly api = inject(CommercialApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly ctx = inject(LedgerContext);
  private readonly ledgerId = this.ctx.activeId() as string;
  protected readonly format = inject(CommercialFormat);
  protected readonly side = inject(ActivatedRoute).snapshot.data['side'] as Side;
  protected readonly statements = this.side === 'ar' ? '/app/invoicing/statements' : '/app/payables/statements';
  protected readonly canManage = inject(AuthService).can(this.side === 'ar' ? 'invoices.create' : 'suppliers.manage');
  protected readonly rows = signal<Party[] | null>(null);
  protected readonly clients = signal<Client[]>([]);
  protected readonly failed = signal(false);
  protected readonly withArchived = signal(false);
  protected readonly editing = signal<Party | null | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly serverError = signal<string | null>(null);
  private term = '';

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    email: ['', Validators.email],
    phone: [''],
    taxRegistrationNo: ['', Validators.pattern(/^\d*$/)],
    paymentTermsDays: [30, [Validators.required, Validators.min(0), Validators.max(365)]],
    clientId: [''],
    archived: [false],
  });

  constructor() {
    this.load();
    if (this.canLinkClient()) {
      inject(ClientsApiService)
        .list({ pageSize: 100 })
        .pipe(catchError(() => of({ data: [] as Client[], meta: { page: 1, pageSize: 100, total: 0 } })))
        .subscribe((p) => this.clients.set(p.data));
    }
  }

  protected canLinkClient(): boolean {
    return this.side === 'ar' && this.ctx.active()?.type === 'firm';
  }

  private load(): void {
    this.failed.set(false);
    this.api.parties(this.ledgerId, this.side, { q: this.term, archived: this.withArchived() }).subscribe({ next: (r) => this.rows.set(r), error: () => this.failed.set(true) });
  }

  protected search(event: Event, q: string): void {
    event.preventDefault();
    this.term = q.trim();
    this.load();
  }

  protected toggleArchived(on: boolean): void {
    this.withArchived.set(on);
    this.load();
  }

  protected open(party: Party | null): void {
    this.serverError.set(null);
    this.form.reset({ name: party?.name ?? '', email: party?.email ?? '', phone: party?.phone ?? '', taxRegistrationNo: party?.taxRegistrationNo ?? '', paymentTermsDays: party?.paymentTermsDays ?? 30, clientId: party?.clientId ?? '', archived: party?.archived ?? false });
    this.editing.set(party);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const input: PartyInput = { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), taxRegistrationNo: v.taxRegistrationNo.trim(), paymentTermsDays: Number(v.paymentTermsDays), ...(this.canLinkClient() ? { clientId: v.clientId } : {}), ...(this.editing() ? { archived: v.archived } : {}) };
    const current = this.editing();
    this.saving.set(true);
    this.serverError.set(null);
    (current ? this.api.updateParty(this.ledgerId, this.side, current.id, input) : this.api.createParty(this.ledgerId, this.side, input)).subscribe({
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
