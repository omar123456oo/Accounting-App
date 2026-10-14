import { Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { HrFormat } from './hr-format';
import { LeaveBalance, LeaveType } from './hr.models';

/** One card per leave type: used, pending and what is left this year. */
@Component({
  selector: 'app-leave-balances',
  imports: [TranslatePipe],
  template: `
    <div class="row g-3 mb-3">
      @for (b of rows(); track b.typeId) {
        <div class="col-6 col-lg-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="small text-body-secondary">{{ format.typeName(types(), b.typeId) }}</div>
              @if (b.remaining === null) {
                <div class="fs-4 fw-bold">{{ 'hr.leave.unlimited' | translate }}</div>
              } @else {
                <div class="fs-3 fw-bold" [class.text-danger]="b.remaining <= 0">{{ b.remaining }}<span class="fs-6 fw-normal text-body-secondary"> / {{ b.entitlement }}</span></div>
              }
              <div class="small text-body-secondary">{{ 'hr.leave.usedPending' | translate: { used: b.used, pending: b.pending } }}</div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class LeaveBalances {
  readonly balances = input.required<readonly LeaveBalance[]>();
  readonly types = input.required<readonly LeaveType[]>();
  protected readonly format = inject(HrFormat);
  protected readonly rows = computed(() => this.balances());
}
