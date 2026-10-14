import { Component, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { ConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { HrApiService } from './hr-api.service';
import { HrFormat } from './hr-format';
import { PayslipView } from './payslip-view';
import { PayrollRun, PayrollRunSummary, PayrollSlip } from './hr.models';

/** Monthly payroll: generate a draft from salaries and approved unpaid leave, review it, then finalise it (locks the payslips). */
@Component({
  selector: 'app-payroll-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, PayslipView, ConfirmDialog],
  template: `
    <app-page-header [title]="'hr.payroll.title' | translate" />
    <div class="alert alert-info small" role="note"><i class="fa-solid fa-circle-info me-1" aria-hidden="true"></i>{{ 'hr.salary.note' | translate }}</div>

    @if (auth.can('payroll.process')) {
      <div class="card mb-4"><div class="card-body d-flex flex-wrap align-items-end gap-2">
        <div>
          <label for="pay-month" class="form-label">{{ 'hr.payroll.month' | translate }}</label>
          <input id="pay-month" type="month" class="form-control" dir="ltr" [value]="month()" (input)="month.set($any($event.target).value)" />
        </div>
        <button type="button" class="btn btn-primary" [disabled]="busy() || !month()" (click)="generate()"><i class="fa-solid fa-gears me-1" aria-hidden="true"></i>{{ 'hr.payroll.generate' | translate }}</button>
        @if (monthError(); as m) {
          <div class="text-danger small" role="alert">{{ m }}</div>
        }
      </div></div>
    }
    @if (error(); as e) {
      <div class="alert alert-danger" role="alert">{{ e }}</div>
    }

    <div class="row g-4">
      <div class="col-lg-4">
        <h2 class="h6">{{ 'hr.payroll.runs' | translate }}</h2>
        @if (runs(); as list) {
          <div class="list-group shadow-sm">
            @for (r of list; track r.month) {
              <button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" [class.active]="run()?.month === r.month" (click)="open(r.month)">
                <span>{{ format.month(r.month) }}<span class="d-block small opacity-75">{{ r.employees }} · <span dir="ltr">{{ format.money(r.net) }}</span></span></span>
                <app-status-badge [label]="'hr.payroll.status.' + r.status | translate" [tone]="r.status === 'final' ? 'success' : 'warning'" />
              </button>
            } @empty {
              <div class="list-group-item text-body-secondary">{{ 'hr.payroll.noRuns' | translate }}</div>
            }
          </div>
        } @else if (failed()) {
          <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
        }
      </div>

      <div class="col-lg-8">
        @if (run(); as r) {
          <div class="d-flex flex-wrap justify-content-between align-items-center mb-2">
            <h2 class="h6 mb-0">{{ format.month(r.month) }} <app-status-badge [label]="'hr.payroll.status.' + r.status | translate" [tone]="r.status === 'final' ? 'success' : 'warning'" /></h2>
            @if (r.status === 'draft' && auth.can('payroll.process')) {
              <button type="button" class="btn btn-success" [disabled]="busy() || r.slips.length === 0" (click)="confirmFinal.set(true)"><i class="fa-solid fa-lock me-1" aria-hidden="true"></i>{{ 'hr.payroll.finalize' | translate }}</button>
            }
          </div>
          @if (r.status === 'final') {
            <p class="small text-body-secondary">{{ 'hr.payroll.finalizedBy' | translate: { by: r.finalizedBy, at: format.dateTime(r.finalizedAt ?? '') } }}</p>
          } @else {
            <p class="small text-body-secondary">{{ 'hr.payroll.draftNote' | translate }}</p>
          }
          <div class="table-responsive">
            <table class="table align-middle">
              <caption class="visually-hidden">{{ 'hr.payroll.payslips' | translate }}</caption>
              <thead>
                <tr>
                  <th scope="col">{{ 'hr.fields.employee' | translate }}</th>
                  <th scope="col" class="text-end">{{ 'hr.payroll.gross' | translate }}</th>
                  <th scope="col" class="text-end">{{ 'hr.payroll.deductions' | translate }}</th>
                  <th scope="col" class="text-end">{{ 'hr.payroll.net' | translate }}</th>
                  <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (s of r.slips; track s.userId) {
                  <tr>
                    <td>{{ s.name }}@if (s.unpaidLeaveDays > 0) { <span class="badge text-bg-warning ms-1">{{ 'hr.payroll.unpaidLeave' | translate: { days: s.unpaidLeaveDays } }}</span> }</td>
                    <td class="text-end" dir="ltr">{{ format.money(s.gross) }}</td>
                    <td class="text-end" dir="ltr">{{ format.money(s.totalDeductions) }}</td>
                    <td class="text-end fw-semibold" dir="ltr">{{ format.money(s.net) }}</td>
                    <td class="text-end"><button type="button" class="btn btn-outline-secondary btn-sm" (click)="slip.set(s)">{{ 'hr.payroll.view' | translate }}<span class="visually-hidden"> {{ s.name }}</span></button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="text-center text-body-secondary py-4">{{ 'hr.payroll.noSlips' | translate }}</td></tr>
                }
              </tbody>
              <tfoot>
                <tr class="table-light fw-bold">
                  <td>{{ 'hr.payroll.total' | translate }}</td>
                  <td class="text-end" dir="ltr">{{ format.money(r.totals.gross) }}</td>
                  <td class="text-end" dir="ltr">{{ format.money(r.totals.deductions) }}</td>
                  <td class="text-end" dir="ltr">{{ format.money(r.totals.net) }}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        } @else {
          <div class="text-body-secondary" role="status">{{ 'hr.payroll.pick' | translate }}</div>
        }
      </div>
    </div>

    @if (slip(); as s) {
      <app-payslip-view [slip]="s" (closed)="slip.set(null)" />
    }
    @if (confirmFinal() && run(); as r) {
      <app-confirm-dialog [title]="'hr.payroll.finalize' | translate" [message]="'hr.payroll.finalizeConfirm' | translate: { month: format.month(r.month) }" [confirmLabel]="'hr.payroll.finalize' | translate" (cancelled)="confirmFinal.set(false)" (confirmed)="finalize(r.month)" />
    }
  `,
})
export class PayrollPage {
  private readonly api = inject(HrApiService);
  protected readonly auth = inject(AuthService);
  protected readonly format = inject(HrFormat);

  protected readonly runs = signal<PayrollRunSummary[] | null>(null);
  protected readonly run = signal<PayrollRun | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly monthError = signal<string | null>(null);
  protected readonly month = signal(new Date().toISOString().slice(0, 7));
  protected readonly slip = signal<PayrollSlip | null>(null);
  protected readonly confirmFinal = signal(false);

  constructor() {
    this.reload();
  }

  private reload(select?: string): void {
    this.api.runs().subscribe({
      next: (r) => {
        this.runs.set(r);
        const target = select ?? this.run()?.month ?? r[0]?.month;
        if (target) this.open(target);
      },
      error: () => this.failed.set(true),
    });
  }

  protected open(month: string): void {
    this.api.run(month).subscribe({ next: (r) => this.run.set(r), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }

  protected generate(): void {
    this.busy.set(true);
    this.error.set(null);
    this.monthError.set(null);
    this.api.generate(this.month()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.run.set(r);
        this.reload(r.month);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.monthError.set(fieldErrors(e)['month'] ?? null);
        if (!this.monthError()) this.error.set(apiErrorMessage(e));
      },
    });
  }

  protected finalize(month: string): void {
    this.confirmFinal.set(false);
    this.busy.set(true);
    this.api.finalize(month).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.run.set(r);
        this.reload(r.month);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(e));
      },
    });
  }
}
