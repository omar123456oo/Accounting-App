import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-errors';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Account } from '../../accounting/accounting.models';
import { LedgerApiService } from '../../accounting/ledger-api.service';
import { LedgerContext } from '../../accounting/ledger-context';
import { CommercialApiService } from '../commercial-api.service';
import { AccountMappings, ExpenseCategory, MAPPING_KEYS, MappingsInput, ServiceType } from '../commercial.models';
import { CommercialFormat } from '../commercial-format';

/**
 * Which ledger accounts commercial documents post to. Nothing is hardcoded: a document that needs a mapping
 * which is not set here is refused with a message naming the missing mapping.
 */
@Component({
  selector: 'app-mappings-page',
  imports: [ReactiveFormsModule, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'commercial.settings.mappings' | translate" />
    <p class="text-body-secondary">{{ 'commercial.mappings.intro' | translate }}</p>
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (loaded()) {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        @if (message(); as m) {
          <div class="alert" [class]="m.ok ? 'alert-success' : 'alert-danger'" [attr.role]="m.ok ? 'status' : 'alert'">{{ m.text ?? ((m.key ?? '') | translate) }}</div>
        }
        <fieldset [disabled]="!canManage || saving()">
          <h2 class="h5">{{ 'commercial.mappings.control' | translate }}</h2>
          <div class="row g-3 mb-4">
            @for (key of keys; track key) {
              <div class="col-12 col-md-6">
                <label [for]="'map-' + key" class="form-label">{{ 'commercial.mappings.keys.' + key | translate }}</label>
                <select [id]="'map-' + key" class="form-select" [formControlName]="key">
                  <option value="">{{ 'commercial.mappings.notSet' | translate }}</option>
                  @for (a of postable(); track a.id) {
                    <option [value]="a.id">{{ a.code }} - {{ format.name(a) }}</option>
                  }
                </select>
                <div class="form-text">{{ 'commercial.mappings.hints.' + key | translate }}</div>
              </div>
            }
          </div>

          <h2 class="h5">{{ 'commercial.mappings.revenue' | translate }}</h2>
          <div class="row g-3 mb-4" formGroupName="revenue">
            @for (s of services(); track s.id) {
              <div class="col-12 col-md-6">
                <label [for]="'rev-' + s.id" class="form-label">{{ format.name(s) }} ({{ s.code }}) - {{ 'commercial.recognition.' + s.recognition | translate }}</label>
                <select [id]="'rev-' + s.id" class="form-select" [formControlName]="s.id">
                  <option value="">{{ 'commercial.mappings.notSet' | translate }}</option>
                  @for (a of postable(); track a.id) {
                    <option [value]="a.id">{{ a.code }} - {{ format.name(a) }}</option>
                  }
                </select>
              </div>
            }
          </div>

          <h2 class="h5">{{ 'commercial.mappings.expense' | translate }}</h2>
          <div class="row g-3 mb-4" formGroupName="expense">
            @for (c of categories(); track c.id) {
              <div class="col-12 col-md-6">
                <label [for]="'exp-' + c.id" class="form-label">{{ format.name(c) }} ({{ c.code }})</label>
                <select [id]="'exp-' + c.id" class="form-select" [formControlName]="c.id">
                  <option value="">{{ 'commercial.mappings.notSet' | translate }}</option>
                  @for (a of postable(); track a.id) {
                    <option [value]="a.id">{{ a.code }} - {{ format.name(a) }}</option>
                  }
                </select>
              </div>
            }
          </div>

          <h2 class="h5">{{ 'commercial.mappings.bank' | translate }}</h2>
          <p class="text-body-secondary small">{{ 'commercial.mappings.bankHint' | translate }}</p>
          <div class="row g-2 mb-4" formGroupName="bank">
            @for (a of assets(); track a.id) {
              <div class="col-12 col-md-4">
                <div class="form-check">
                  <input [id]="'bank-' + a.id" type="checkbox" class="form-check-input" [formControlName]="a.id" />
                  <label [for]="'bank-' + a.id" class="form-check-label">{{ a.code }} - {{ format.name(a) }}</label>
                </div>
              </div>
            }
          </div>

          <h2 class="h5">{{ 'commercial.mappings.policy' | translate }}</h2>
          <div class="form-check mb-4">
            <input id="allow-draft" type="checkbox" class="form-check-input" formControlName="allowDraftRates" />
            <label for="allow-draft" class="form-check-label">{{ 'commercial.mappings.allowDraftRates' | translate }}</label>
            <div class="form-text">{{ 'commercial.mappings.allowDraftRatesHint' | translate }}</div>
          </div>
        </fieldset>
        @if (canManage) {
          <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ 'common.save' | translate }}</button>
        } @else {
          <p class="text-body-secondary">{{ 'commercial.mappings.readOnly' | translate }}</p>
        }
      </form>
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class MappingsPage {
  private readonly api = inject(CommercialApiService);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly canManage = inject(AuthService).can('mappings.manage');
  protected readonly keys = MAPPING_KEYS;

  protected readonly accounts = signal<Account[]>([]);
  protected readonly services = signal<ServiceType[]>([]);
  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly message = signal<{ ok: boolean; key?: string; text?: string | null } | null>(null);
  protected readonly postable = computed(() => this.accounts().filter((a) => a.isPostable && a.isActive));
  protected readonly assets = computed(() => this.postable().filter((a) => a.category === 'asset'));

  protected form: FormGroup = new FormGroup({});

  constructor() {
    forkJoin({
      accounts: inject(LedgerApiService).accounts(this.ledgerId),
      mappings: this.api.mappings(this.ledgerId),
      services: this.api.serviceTypes(this.ledgerId),
      categories: this.api.categories(this.ledgerId),
      settings: this.api.settings(this.ledgerId),
    }).subscribe({
      next: ({ accounts, mappings, services, categories, settings }) => {
        this.accounts.set(accounts);
        this.services.set(services);
        this.categories.set(categories);
        this.form = this.buildForm(mappings, accounts, services, categories, settings.allowDraftRates);
        this.loaded.set(true);
      },
      error: () => this.failed.set(true),
    });
  }

  private buildForm(m: AccountMappings, accounts: Account[], services: ServiceType[], categories: ExpenseCategory[], allow: boolean): FormGroup {
    const text = (value: string) => new FormControl(value, { nonNullable: true });
    const flag = (value: boolean) => new FormControl(value, { nonNullable: true });
    return new FormGroup({
      ...Object.fromEntries(MAPPING_KEYS.map((k) => [k, text(m[k] ?? '')])),
      revenue: new FormGroup(Object.fromEntries(services.map((s) => [s.id, text(m.revenueByService[s.id] ?? '')]))),
      expense: new FormGroup(Object.fromEntries(categories.map((c) => [c.id, text(m.expenseByCategory[c.id] ?? '')]))),
      bank: new FormGroup(Object.fromEntries(accounts.filter((a) => a.isPostable && a.isActive && a.category === 'asset').map((a) => [a.id, flag(m.paymentAccounts.includes(a.id))]))),
      allowDraftRates: flag(allow),
    });
  }

  protected save(): void {
    if (!this.canManage || this.saving()) return;
    const v = this.form.getRawValue() as Record<string, unknown> & { revenue: Record<string, string>; expense: Record<string, string>; bank: Record<string, boolean>; allowDraftRates: boolean };
    const input: MappingsInput = { revenueByService: v.revenue, expenseByCategory: v.expense, paymentAccounts: Object.entries(v.bank).filter(([, on]) => on).map(([id]) => id) };
    for (const k of MAPPING_KEYS) (input as Record<string, unknown>)[k] = v[k] as string;
    this.saving.set(true);
    this.message.set(null);
    forkJoin([this.api.saveMappings(this.ledgerId, input), this.api.updateSettings(this.ledgerId, { allowDraftRates: v.allowDraftRates })]).subscribe({
      next: () => {
        this.saving.set(false);
        this.message.set({ ok: true, key: 'commercial.mappings.saved' });
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.message.set({ ok: false, text: apiErrorMessage(e), key: 'errors.generic' });
      },
    });
  }
}
