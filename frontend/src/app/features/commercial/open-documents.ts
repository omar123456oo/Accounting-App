import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { isPositive } from '../../core/money/money';
import { InvoicingApiService } from '../invoicing/invoicing-api.service';
import { PayablesApiService } from '../payables/payables-api.service';
import { DocBase, Side } from './commercial.models';

const OPEN = ['issued', 'approved', 'partially_paid', 'overdue'];

/** The open invoices of a customer or open bills of a supplier: what a payment can be allocated to. */
@Injectable({ providedIn: 'root' })
export class OpenDocuments {
  private readonly invoices = inject(InvoicingApiService);
  private readonly bills = inject(PayablesApiService);

  of(ledger: string, side: Side, partyId: string): Observable<DocBase[]> {
    const page$: Observable<{ data: DocBase[] }> = side === 'ar' ? this.invoices.list(ledger, { partyId, pageSize: 100 }) : this.bills.list(ledger, { partyId, pageSize: 100 });
    return page$.pipe(map((page) => page.data.filter((d) => OPEN.includes(d.status) && isPositive(d.balance))));
  }
}
