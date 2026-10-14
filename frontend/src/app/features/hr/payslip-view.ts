import { Component, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Modal } from '../../shared/components/modal/modal';
import { HrFormat } from './hr-format';
import { PayrollSlip } from './hr.models';

/** One payslip. Printable: the shell, banner and buttons drop out when printing (see styles.scss). */
@Component({
  selector: 'app-payslip-view',
  imports: [TranslatePipe, Modal],
  template: `
    <app-modal [title]="('hr.payroll.payslip' | translate) + ' — ' + format.month(slip().month)" width="38rem" (closed)="closed.emit()">
      <div class="d-flex justify-content-between mb-2">
        <div class="fw-semibold">{{ slip().name }}</div>
        <div class="text-body-secondary">{{ format.month(slip().month) }}</div>
      </div>
      <table class="table table-sm align-middle">
        <caption class="visually-hidden">{{ 'hr.payroll.payslip' | translate }}</caption>
        <tbody>
          <tr><th scope="row">{{ 'hr.salary.base' | translate }}</th><td class="text-end" dir="ltr">{{ format.money(slip().baseSalary) }}</td></tr>
          @for (a of slip().allowances; track $index) {
            <tr><td class="ps-4">+ {{ a.name }}</td><td class="text-end" dir="ltr">{{ format.money(a.amount) }}</td></tr>
          }
          <tr class="table-light"><th scope="row">{{ 'hr.payroll.gross' | translate }}</th><td class="text-end fw-semibold" dir="ltr">{{ format.money(slip().gross) }}</td></tr>
          @for (d of slip().deductions; track $index) {
            <tr><td class="ps-4">− {{ d.name }}</td><td class="text-end" dir="ltr">{{ format.money(d.amount) }}</td></tr>
          }
          @if (slip().unpaidLeaveDays > 0) {
            <tr><td class="ps-4">− {{ 'hr.payroll.unpaidLeave' | translate: { days: slip().unpaidLeaveDays } }}</td><td class="text-end" dir="ltr">{{ format.money(slip().unpaidLeaveDeduction) }}</td></tr>
          }
          <tr class="table-light"><th scope="row">{{ 'hr.payroll.deductions' | translate }}</th><td class="text-end fw-semibold" dir="ltr">{{ format.money(slip().totalDeductions) }}</td></tr>
          <tr class="table-primary"><th scope="row">{{ 'hr.payroll.net' | translate }}</th><td class="text-end fw-bold" dir="ltr">{{ format.money(slip().net) }}</td></tr>
        </tbody>
      </table>
      <div class="d-flex justify-content-end gap-2 no-print">
        <button type="button" class="btn btn-outline-secondary" (click)="print()"><i class="fa-solid fa-print me-1" aria-hidden="true"></i>{{ 'hr.payroll.print' | translate }}</button>
        <button type="button" class="btn btn-primary" (click)="closed.emit()">{{ 'common.close' | translate }}</button>
      </div>
    </app-modal>
  `,
})
export class PayslipView {
  readonly slip = input.required<PayrollSlip>();
  readonly closed = output<void>();
  protected readonly format = inject(HrFormat);

  protected print(): void {
    window.print();
  }
}
