import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { LedgerContext } from '../accounting/ledger-context';
import { CommercialFormat } from '../commercial/commercial-format';
import { Quotation } from '../commercial/commercial.models';
import { InvoicingApiService } from './invoicing-api.service';

/** Quotations: send, accept or reject, then convert into a draft invoice. A quotation never posts anything. */
@Component({
  selector: 'app-quotation-list',
  imports: [RouterLink, TranslatePipe, PageHeader, StatusBadge],
  template: `
    <app-page-header [title]="'commercial.quotations.title' | translate">
      @if (canCreate) {
        <a class="btn btn-primary" routerLink="/app/invoicing/quotations/new">{{ 'commercial.quotations.new' | translate }}</a>
      }
    </app-page-header>
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (rows(); as list) {
      @if (list.length === 0) {
        <div class="alert alert-secondary" role="status">{{ 'commercial.quotations.empty' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'commercial.quotations.title' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'commercial.docs.col.reference' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.arParty' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.date' | translate }}</th>
                <th scope="col">{{ 'commercial.quotations.validUntil' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.total' | translate }}</th>
                <th scope="col">{{ 'commercial.docs.col.status' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (q of list; track q.id) {
                <tr>
                  <td dir="ltr" class="text-start">{{ q.reference }}</td>
                  <td>{{ q.partyName }}</td>
                  <td>{{ format.date(q.date) }}</td>
                  <td>{{ format.date(q.validUntil) }}</td>
                  <td dir="ltr" class="text-end">{{ format.amount(q.total) }}</td>
                  <td><app-status-badge [label]="'commercial.quotations.status.' + q.status | translate" [tone]="format.tone[q.status]" /></td>
                  <td class="text-end">
                    @if (canCreate) {
                      <span class="d-inline-flex flex-wrap gap-1">
                        @if (q.status === 'draft') {
                          <button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="busy()" (click)="move(q, 'send')">{{ 'commercial.quotations.send' | translate }}<span class="visually-hidden"> {{ q.reference }}</span></button>
                        }
                        @if (q.status === 'sent') {
                          <button type="button" class="btn btn-outline-success btn-sm" [disabled]="busy()" (click)="move(q, 'accept')">{{ 'commercial.quotations.accept' | translate }}<span class="visually-hidden"> {{ q.reference }}</span></button>
                          <button type="button" class="btn btn-outline-danger btn-sm" [disabled]="busy()" (click)="move(q, 'reject')">{{ 'commercial.quotations.reject' | translate }}<span class="visually-hidden"> {{ q.reference }}</span></button>
                        }
                        @if (q.status === 'sent' || q.status === 'accepted') {
                          <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="convert(q)">{{ 'commercial.quotations.convert' | translate }}<span class="visually-hidden"> {{ q.reference }}</span></button>
                        }
                        @if (q.convertedInvoiceId) {
                          <a class="btn btn-outline-secondary btn-sm" [routerLink]="['/app/invoicing/invoices', q.convertedInvoiceId]">{{ 'commercial.quotations.viewInvoice' | translate }}</a>
                        }
                      </span>
                    }
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
  `,
})
export class QuotationList {
  private readonly api = inject(InvoicingApiService);
  private readonly router = inject(Router);
  protected readonly format = inject(CommercialFormat);
  private readonly ledgerId = inject(LedgerContext).activeId() as string;
  protected readonly canCreate = inject(AuthService).can('invoices.create');
  protected readonly rows = signal<Quotation[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.quotations(this.ledgerId).subscribe({ next: (p) => this.rows.set(p.data), error: () => this.failed.set(true) });
  }

  private run<T>(request: Observable<T>, then: (r: T) => void): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (r) => {
        this.busy.set(false);
        then(r);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected move(q: Quotation, action: 'send' | 'accept' | 'reject'): void {
    this.run(this.api.moveQuotation(this.ledgerId, q.id, action), () => this.load());
  }

  protected convert(q: Quotation): void {
    this.run(this.api.convertQuotation(this.ledgerId, q.id), (r) => void this.router.navigate(['/app/invoicing/invoices', r.invoiceId]));
  }
}
