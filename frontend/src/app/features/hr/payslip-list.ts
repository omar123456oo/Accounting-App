import { Component, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HrApiService } from './hr-api.service';
import { HrFormat } from './hr-format';
import { PayslipView } from './payslip-view';
import { PayrollSlip } from './hr.models';

/** A person's finalised payslips, newest first. */
@Component({
  selector: 'app-payslip-list',
  imports: [TranslatePipe, PayslipView],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (slips(); as list) {
      @if (list.length === 0) {
        <div class="text-body-secondary py-3" role="status">{{ 'hr.payroll.noSlips' | translate }}</div>
      } @else {
        <div class="table-responsive">
          <table class="table align-middle">
            <caption class="visually-hidden">{{ 'hr.payroll.payslips' | translate }}</caption>
            <thead>
              <tr>
                <th scope="col">{{ 'hr.payroll.month' | translate }}</th>
                <th scope="col" class="text-end">{{ 'hr.payroll.gross' | translate }}</th>
                <th scope="col" class="text-end">{{ 'hr.payroll.deductions' | translate }}</th>
                <th scope="col" class="text-end">{{ 'hr.payroll.net' | translate }}</th>
                <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of list; track s.month) {
                <tr>
                  <td>{{ format.month(s.month) }}</td>
                  <td class="text-end" dir="ltr">{{ format.money(s.gross) }}</td>
                  <td class="text-end" dir="ltr">{{ format.money(s.totalDeductions) }}</td>
                  <td class="text-end fw-semibold" dir="ltr">{{ format.money(s.net) }}</td>
                  <td class="text-end"><button type="button" class="btn btn-outline-secondary btn-sm" (click)="open.set(s)">{{ 'hr.payroll.view' | translate }}</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
    @if (open(); as s) {
      <app-payslip-view [slip]="s" (closed)="open.set(null)" />
    }
  `,
})
export class PayslipList {
  readonly userId = input<string>();
  protected readonly format = inject(HrFormat);
  private readonly api = inject(HrApiService);
  protected readonly slips = signal<PayrollSlip[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly open = signal<PayrollSlip | null>(null);

  ngOnInit(): void {
    this.api.slips(this.userId()).subscribe({ next: (r) => this.slips.set(r), error: () => this.failed.set(true) });
  }
}
