import { Component, inject, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';
import { HrFormat, LEAVE_TONE } from './hr-format';
import { LeaveApplication, LeaveType } from './hr.models';

/** Leave applications as a table. Which row actions appear is decided by the page; the server decides what is allowed. */
@Component({
  selector: 'app-leave-table',
  imports: [TranslatePipe, StatusBadge],
  template: `
    @if (rows().length === 0) {
      <div class="text-body-secondary py-3" role="status">{{ 'hr.leave.none' | translate }}</div>
    } @else {
      <div class="table-responsive">
        <table class="table align-middle">
          <caption class="visually-hidden">{{ 'hr.leave.title' | translate }}</caption>
          <thead>
            <tr>
              @if (showPerson()) {
                <th scope="col">{{ 'hr.fields.employee' | translate }}</th>
              }
              <th scope="col">{{ 'hr.leave.type' | translate }}</th>
              <th scope="col">{{ 'hr.leave.from' | translate }}</th>
              <th scope="col">{{ 'hr.leave.to' | translate }}</th>
              <th scope="col" class="text-end">{{ 'hr.leave.days' | translate }}</th>
              <th scope="col">{{ 'hr.fields.status' | translate }}</th>
              <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
            </tr>
          </thead>
          <tbody>
            @for (l of rows(); track l.id) {
              <tr>
                @if (showPerson()) {
                  <td>{{ l.userName }}</td>
                }
                <td>
                  {{ format.typeName(types(), l.typeId) }}
                  @if (l.reason) {
                    <div class="small text-body-secondary">{{ l.reason }}</div>
                  }
                </td>
                <td>{{ format.date(l.from) }}</td>
                <td>{{ format.date(l.to) }}</td>
                <td class="text-end">{{ l.days }}</td>
                <td>
                  <app-status-badge [label]="'hr.leave.status.' + l.status | translate" [tone]="tone[l.status]" />
                  @if (l.note) {
                    <div class="small text-body-secondary">{{ l.decidedBy }}: {{ l.note }}</div>
                  }
                </td>
                <td class="text-end text-nowrap">
                  @if (l.status === 'pending') {
                    @if (canDecide() && l.userId !== selfId()) {
                      <button type="button" class="btn btn-success btn-sm me-1" (click)="approve.emit(l)">{{ 'hr.leave.approve' | translate }}</button>
                      <button type="button" class="btn btn-outline-danger btn-sm me-1" (click)="reject.emit(l)">{{ 'hr.leave.reject' | translate }}</button>
                    }
                    @if (l.userId === selfId() || canManage()) {
                      <button type="button" class="btn btn-outline-secondary btn-sm" (click)="cancel.emit(l)">{{ 'hr.leave.cancel' | translate }}</button>
                    }
                  } @else if (l.status === 'approved' && canManage()) {
                    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="cancel.emit(l)">{{ 'hr.leave.cancel' | translate }}</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class LeaveTable {
  readonly rows = input.required<readonly LeaveApplication[]>();
  readonly types = input.required<readonly LeaveType[]>();
  readonly selfId = input('');
  readonly showPerson = input(true);
  readonly canDecide = input(false);
  readonly canManage = input(false);
  readonly approve = output<LeaveApplication>();
  readonly reject = output<LeaveApplication>();
  readonly cancel = output<LeaveApplication>();

  protected readonly format = inject(HrFormat);
  protected readonly tone = LEAVE_TONE;
}
