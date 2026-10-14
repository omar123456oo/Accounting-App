import { Component, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { HrApiService } from './hr-api.service';
import { LeaveApplyDialog } from './leave-apply-dialog';
import { LeaveBalances } from './leave-balances';
import { LeaveTable } from './leave-table';
import { LeaveApplication, LeaveBalance, LeaveType } from './hr.models';

type Pending = { l: LeaveApplication; action: 'approve' | 'reject' } | null;

/** One employee's balances and requests. HR managers can also file leave for them. */
@Component({
  selector: 'app-employee-leave-panel',
  imports: [TranslatePipe, LeaveBalances, LeaveTable, LeaveApplyDialog, CommentDialog],
  template: `
    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (types(); as t) {
      @if (auth.can('hr.manage')) {
        <div class="mb-3">
          <button type="button" class="btn btn-outline-primary btn-sm" (click)="applying.set(true)"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'hr.leave.addFor' | translate }}</button>
        </div>
      }
      <app-leave-balances [balances]="balances()" [types]="t" />
      @if (error(); as e) {
        <div class="alert alert-danger" role="alert">{{ e }}</div>
      }
      <app-leave-table [rows]="rows()" [types]="t" [selfId]="auth.user()?.id ?? ''" [showPerson]="false" [canDecide]="auth.can('leave.approve')" [canManage]="auth.can('hr.manage')" (approve)="pending.set({ l: $event, action: 'approve' })" (reject)="pending.set({ l: $event, action: 'reject' })" (cancel)="act(api.cancel($event.id))" />
      @if (applying()) {
        <app-leave-apply-dialog [types]="t" [userId]="userId()" (done)="applying.set(false); load()" (cancelled)="applying.set(false)" />
      }
      @if (pending(); as p) {
        <app-comment-dialog
          [title]="(p.action === 'approve' ? 'hr.leave.approve' : 'hr.leave.reject') | translate"
          [label]="'hr.leave.note' | translate"
          [confirmLabel]="(p.action === 'approve' ? 'hr.leave.approve' : 'hr.leave.reject') | translate"
          [required]="p.action === 'reject'"
          [danger]="p.action === 'reject'"
          (confirmed)="decide(p, $event)"
          (cancelled)="pending.set(null)"
        />
      }
    } @else {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    }
  `,
})
export class EmployeeLeavePanel {
  readonly userId = input.required<string>();
  protected readonly api = inject(HrApiService);
  protected readonly auth = inject(AuthService);
  protected readonly types = signal<LeaveType[] | null>(null);
  protected readonly balances = signal<LeaveBalance[]>([]);
  protected readonly rows = signal<LeaveApplication[]>([]);
  protected readonly failed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly pending = signal<Pending>(null);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const id = this.userId();
    forkJoin({ types: this.api.leaveTypes(), balances: this.api.balances(id), rows: this.api.leave({ userId: id }) }).subscribe({
      next: ({ types, balances, rows }) => {
        this.types.set(types);
        this.balances.set(balances);
        // Staff without HR rights are limited to their own list by the server; the filter keeps this panel honest either way.
        this.rows.set(rows.filter((l) => l.userId === id));
      },
      error: () => this.failed.set(true),
    });
  }

  protected decide(p: NonNullable<Pending>, note: string): void {
    this.pending.set(null);
    this.act(this.api.decide(p.l.id, p.action, note));
  }

  protected act(call: ReturnType<HrApiService['cancel']>): void {
    this.error.set(null);
    call.subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e) ?? 'Error') });
  }
}
