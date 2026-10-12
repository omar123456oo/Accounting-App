import { Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { abs } from '../../core/money/money';
import { CommercialFormat } from './commercial-format';
import { OpenDoc, autoAllocate, summarize } from './allocation';

/**
 * The allocation table of a payment: one row per open document with the amount to allocate, and live totals
 * (allocated, still unallocated, remaining per document) computed with the money module. A row cannot exceed the
 * document's open balance and the table cannot exceed the amount available; the problem is stated in text.
 */
@Component({
  selector: 'app-allocation-table',
  imports: [TranslatePipe],
  template: `
    @if (docs().length === 0) {
      <div class="alert alert-secondary" role="status">{{ 'commercial.allocation.none' | translate }}</div>
    } @else {
      <div class="d-flex flex-wrap gap-2 mb-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="auto()">{{ 'commercial.allocation.auto' | translate }}</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" (click)="valuesChange.emit({})">{{ 'commercial.allocation.clear' | translate }}</button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm align-middle" id="allocation-table">
          <caption class="visually-hidden">{{ 'commercial.allocation.caption' | translate }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ 'commercial.docs.col.reference' | translate }}</th>
              <th scope="col">{{ 'commercial.docs.col.dueDate' | translate }}</th>
              <th scope="col">{{ 'commercial.docs.col.balance' | translate }}</th>
              <th scope="col">{{ 'commercial.allocation.amount' | translate }}</th>
              <th scope="col">{{ 'commercial.allocation.remaining' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            @for (d of docs(); track d.id; let i = $index) {
              <tr>
                <td dir="ltr" class="text-start">{{ d.reference }}</td>
                <td>{{ format.date(d.dueDate) }}</td>
                <td dir="ltr" class="text-end">{{ format.amount(d.balance) }}</td>
                <td>
                  <label class="visually-hidden" [for]="'alloc-' + i">{{ 'commercial.allocation.amount' | translate }} {{ d.reference }}</label>
                  <input [id]="'alloc-' + i" class="form-control form-control-sm text-end" dir="ltr" inputmode="decimal" [value]="values()[d.id] ?? ''" [class.is-invalid]="summary().rows[i].problem !== null" [attr.aria-invalid]="summary().rows[i].problem !== null" [attr.aria-describedby]="'alloc-err-' + i" (input)="set(d.id, $any($event.target).value)" />
                  @if (summary().rows[i].problem; as p) {
                    <div class="invalid-feedback d-block" role="alert" [id]="'alloc-err-' + i">{{ 'commercial.allocation.problem.' + p | translate }}</div>
                  }
                </td>
                <td dir="ltr" class="text-end" [id]="'alloc-remaining-' + i">{{ format.amount(summary().rows[i].remaining) }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colspan="3" class="text-end">{{ 'commercial.allocation.allocated' | translate }}</th>
              <td dir="ltr" class="text-end fw-bold" id="alloc-total">{{ format.amount(summary().allocated) }}</td>
              <td></td>
            </tr>
            <tr>
              <th scope="row" colspan="3" class="text-end">{{ 'commercial.allocation.unallocated' | translate }}</th>
              <td dir="ltr" class="text-end fw-bold" id="alloc-unallocated">{{ format.amount(summary().unallocated) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      @if (summary().overCapacity) {
        <div id="alloc-over" class="alert alert-danger py-2" role="alert">{{ 'commercial.allocation.overCapacity' | translate: { amount: format.amount(over()) } }}</div>
      }
    }
  `,
})
export class AllocationTable {
  protected readonly format = inject(CommercialFormat);
  readonly docs = input.required<readonly OpenDoc[]>();
  /** Allocation amount by document id (decimal strings as typed). */
  readonly values = input.required<Readonly<Record<string, string>>>();
  /** The amount available to allocate: the payment amount, or the unapplied part of an earlier payment. */
  readonly capacity = input.required<string>();
  readonly valuesChange = output<Record<string, string>>();

  protected readonly summary = computed(() => summarize(this.docs(), this.values(), this.capacity()));
  protected readonly over = computed(() => abs(this.summary().unallocated));

  protected set(id: string, value: string): void {
    this.valuesChange.emit({ ...this.values(), [id]: value });
  }

  protected auto(): void {
    this.valuesChange.emit(autoAllocate(this.docs(), this.capacity()));
  }
}
