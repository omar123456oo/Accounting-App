import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CommercialFormat } from './commercial-format';
import { Side, TaxRate } from './commercial.models';
import { RawLine, lineGroup, previewLines } from './lines-preview';

/**
 * The editable lines of an invoice, quotation or bill with live amounts. The amounts shown are computed with the
 * same exact-decimal rule as the server (rounded half up per line), so what you see is what is stored.
 */
@Component({
  selector: 'app-doc-lines-editor',
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <div class="table-responsive">
      <table class="table table-sm align-middle doc-lines">
        <caption class="visually-hidden">{{ 'commercial.lines.caption' | translate }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'commercial.lines.description' | translate }}</th>
            <th scope="col">{{ (side() === 'ar' ? 'commercial.lines.service' : 'commercial.lines.category') | translate }}</th>
            <th scope="col">{{ 'commercial.lines.qty' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.unitPrice' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.discount' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.tax' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.total' | translate }}</th>
            <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
          </tr>
        </thead>
        <tbody>
          @for (g of controls(); track g; let i = $index) {
            <tr [formGroup]="g">
              <td>
                <label class="visually-hidden" [for]="'line-desc-' + i">{{ 'commercial.lines.description' | translate }} {{ i + 1 }}</label>
                <input [id]="'line-desc-' + i" class="form-control form-control-sm" formControlName="description" />
              </td>
              <td>
                <label class="visually-hidden" [for]="'line-item-' + i">{{ (side() === 'ar' ? 'commercial.lines.service' : 'commercial.lines.category') | translate }} {{ i + 1 }}</label>
                <select [id]="'line-item-' + i" class="form-select form-select-sm" formControlName="itemId">
                  <option value="">{{ 'commercial.lines.choose' | translate }}</option>
                  @for (item of items(); track item.id) {
                    <option [value]="item.id">{{ item.label }}</option>
                  }
                </select>
              </td>
              <td>
                <label class="visually-hidden" [for]="'line-qty-' + i">{{ 'commercial.lines.qty' | translate }} {{ i + 1 }}</label>
                <input [id]="'line-qty-' + i" class="form-control form-control-sm text-end" dir="ltr" inputmode="decimal" formControlName="qty" />
              </td>
              <td>
                <label class="visually-hidden" [for]="'line-price-' + i">{{ 'commercial.lines.unitPrice' | translate }} {{ i + 1 }}</label>
                <input [id]="'line-price-' + i" class="form-control form-control-sm text-end" dir="ltr" inputmode="decimal" formControlName="unitPrice" />
              </td>
              <td>
                <label class="visually-hidden" [for]="'line-discount-' + i">{{ 'commercial.lines.discount' | translate }} {{ i + 1 }}</label>
                <input [id]="'line-discount-' + i" class="form-control form-control-sm text-end" dir="ltr" inputmode="decimal" formControlName="discount" />
              </td>
              <td>
                <label class="visually-hidden" [for]="'line-tax-' + i">{{ 'commercial.lines.tax' | translate }} {{ i + 1 }}</label>
                <select [id]="'line-tax-' + i" class="form-select form-select-sm" formControlName="taxRateId">
                  <option value="">{{ 'commercial.lines.exempt' | translate }}</option>
                  @for (r of rateOptions(); track r.id) {
                    <option [value]="r.id" [disabled]="!r.effective">
                      {{ r.code }} ({{ r.rate }}%)@if (r.unverified) { - {{ 'commercial.tax.unverifiedShort' | translate }} }@if (!r.effective) { - {{ 'commercial.tax.notEffective' | translate }} }
                    </option>
                  }
                </select>
              </td>
              <td dir="ltr" class="text-end" [id]="'line-total-' + i">{{ preview().lines[i] ? format.amount(preview().lines[i]!.total) : '-' }}</td>
              <td class="text-end">
                <button type="button" class="btn btn-outline-danger btn-sm" [disabled]="controls().length <= 1" (click)="remove(i)">
                  {{ 'commercial.lines.remove' | translate }}<span class="visually-hidden"> {{ i + 1 }}</span>
                </button>
              </td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colspan="6" class="text-end">{{ 'commercial.totals.net' | translate }}</th>
            <td dir="ltr" class="text-end" id="doc-net">{{ format.amount(preview().totals.net) }}</td>
            <td></td>
          </tr>
          <tr>
            <th scope="row" colspan="6" class="text-end">{{ 'commercial.totals.tax' | translate }}</th>
            <td dir="ltr" class="text-end" id="doc-tax">{{ format.amount(preview().totals.taxTotal) }}</td>
            <td></td>
          </tr>
          <tr class="fw-bold">
            <th scope="row" colspan="6" class="text-end">{{ 'commercial.totals.total' | translate }}</th>
            <td dir="ltr" class="text-end" id="doc-total">{{ format.amount(preview().totals.total) }}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="add()">{{ 'commercial.lines.add' | translate }}</button>
    @if (usesUnverified()) {
      <div class="alert alert-warning mt-3 mb-0" role="status">{{ 'commercial.tax.unverifiedWarning' | translate }}</div>
    }
  `,
})
export class DocLinesEditor {
  protected readonly format = inject(CommercialFormat);
  readonly side = input.required<Side>();
  readonly lines = input.required<FormArray<FormGroup>>();
  readonly items = input.required<ReadonlyArray<{ id: string; label: string }>>();
  readonly rates = input.required<readonly TaxRate[]>();
  readonly date = input('');

  /** Bumped on every change of the lines so the OnPush view recomputes the amounts. */
  private readonly tick = signal(0);
  protected readonly controls = computed(() => {
    this.tick();
    return [...this.lines().controls];
  });
  protected readonly preview = computed(() => {
    this.tick();
    return previewLines(this.lines().getRawValue() as RawLine[], this.rates());
  });
  protected readonly rateOptions = computed(() => {
    const date = this.date();
    return this.rates()
      .filter((r) => r.approvalStatus !== 'retired')
      .map((r) => ({ id: r.id, code: r.code, rate: r.rate, unverified: r.approvalStatus !== 'professionally_verified', effective: !date || (date >= r.effectiveFrom && (!r.effectiveTo || date <= r.effectiveTo)) }));
  });
  protected readonly usesUnverified = computed(() => {
    this.tick();
    const chosen = new Set((this.lines().getRawValue() as RawLine[]).map((l) => l.taxRateId).filter(Boolean));
    return this.rates().some((r) => chosen.has(r.id) && r.approvalStatus !== 'professionally_verified');
  });

  constructor() {
    effect((onCleanup) => {
      const sub = this.lines().valueChanges.subscribe(() => this.tick.update((n) => n + 1));
      this.tick.update((n) => n + 1);
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected add(): void {
    this.lines().push(lineGroup());
    this.lines().markAsDirty();
  }

  protected remove(index: number): void {
    if (this.lines().length <= 1) return;
    this.lines().removeAt(index);
    this.lines().markAsDirty();
  }
}
