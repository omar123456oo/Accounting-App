import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommercialFormat } from './commercial-format';
import { DocLine } from './commercial.models';

/** Read-only lines of a stored document, showing the tax rate snapshot each line kept. */
@Component({
  selector: 'app-doc-lines-table',
  imports: [TranslatePipe],
  template: `
    <div class="table-responsive">
      <table class="table align-middle">
        <caption class="caption-top">{{ 'commercial.lines.caption' | translate }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'commercial.lines.description' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.qty' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.unitPrice' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.discount' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.net' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.tax' | translate }}</th>
            <th scope="col">{{ 'commercial.lines.total' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          @for (l of lines(); track $index) {
            <tr>
              <td>
                {{ l.description }}
                @if (l.recognition === 'deferred_over_period') {
                  <span class="d-block small text-body-secondary">{{ 'commercial.recognition.deferred_over_period' | translate }}</span>
                }
              </td>
              <td dir="ltr" class="text-end">{{ l.qty }}</td>
              <td dir="ltr" class="text-end">{{ format.amount(l.unitPrice) }}</td>
              <td dir="ltr" class="text-end">{{ l.discount }}%</td>
              <td dir="ltr" class="text-end">{{ format.amount(l.net) }}</td>
              <td dir="ltr" class="text-end">
                {{ format.amount(l.taxAmount) }}
                @if (l.tax; as t) {
                  <span class="d-block small text-body-secondary">{{ t.code }} {{ t.percent }}% ({{ 'commercial.tax.version' | translate: { version: t.version } }})</span>
                } @else {
                  <span class="d-block small text-body-secondary">{{ 'commercial.lines.exempt' | translate }}</span>
                }
              </td>
              <td dir="ltr" class="text-end">{{ format.amount(l.total) }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colspan="4" class="text-end">{{ 'commercial.totals.net' | translate }}</th>
            <td dir="ltr" class="text-end" colspan="3" id="doc-net">{{ format.amount(net()) }}</td>
          </tr>
          <tr>
            <th scope="row" colspan="4" class="text-end">{{ 'commercial.totals.tax' | translate }}</th>
            <td dir="ltr" class="text-end" colspan="3" id="doc-tax">{{ format.amount(taxTotal()) }}</td>
          </tr>
          <tr class="fw-bold">
            <th scope="row" colspan="4" class="text-end">{{ 'commercial.totals.total' | translate }}</th>
            <td dir="ltr" class="text-end" colspan="3" id="doc-total">{{ format.amount(total()) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `,
})
export class DocLinesTable {
  protected readonly format = inject(CommercialFormat);
  readonly lines = input.required<readonly DocLine[]>();
  readonly net = input.required<string>();
  readonly taxTotal = input.required<string>();
  readonly total = input.required<string>();
}
