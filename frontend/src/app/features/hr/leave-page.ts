import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { HrApiService } from './hr-api.service';
import { LeaveApplyDialog } from './leave-apply-dialog';
import { LeaveBalances } from './leave-balances';
import { LeaveTable } from './leave-table';
import { LEAVE_STATUSES, LeaveApplication, LeaveBalance, LeaveStatus, LeaveType } from './hr.models';

type Pending = { l: LeaveApplication; action: 'approve' | 'reject' } | null;

/** Everyone: own balances and requests. Approvers (leave.approve) also see and decide everyone's. */
@Component({
  selector: 'app-leave-page',
  imports: [TranslatePipe, PageHeader, LeaveBalances, LeaveTable, LeaveApplyDialog, CommentDialog],
  template: `
    <app-page-header [title]="'hr.leave.title' | translate">
      @if (auth.can('leave.apply')) {
        <button type="button" class="btn btn-primary" (click)="applying.set(true)"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'hr.leave.apply' | translate }}</button>
      }
    </app-page-header>

    @if (failed()) {
      <div class="alert alert-danger" role="alert">{{ 'clients.loadFailed' | translate }}</div>
    } @else if (types(); as t) {
      <h2 class="h6 text-body-secondary">{{ 'hr.leave.myBalances' | translate }}</h2>
      <app-leave-balances [balances]="balances()" [types]="t" />

      @if (canSeeAll()) {
        <ul class="nav nav-tabs mb-3" role="tablist">
          <li class="nav-item"><button type="button" class="nav-link" [class.active]="scope() === 'mine'" (click)="scope.set('mine')">{{ 'hr.leave.mine' | translate }}</button></li>
          <li class="nav-item"><button type="button" class="nav-link" [class.active]="scope() === 'all'" (click)="scope.set('all')">{{ 'hr.leave.all' | translate }}</button></li>
        </ul>
      }
      @if (scope() === 'all') {
        <div class="d-flex flex-wrap gap-2 mb-2">
          <label for="lv-status" class="visually-hidden">{{ 'hr.fields.status' | translate }}</label>
          <select id="lv-status" class="form-select w-auto" [value]="status()" (change)="status.set($any($event.target).value)">
            <option value="">{{ 'hr.leave.anyStatus' | translate }}</option>
            @for (s of statuses; track s) {
              <option [value]="s">{{ 'hr.leave.status.' + s | translate }}</option>
            }
          </select>
        </div>
      }
      @if (error(); as e) {
        <div class="alert alert-danger" role="alert">{{ e }}</div>
      }
      <app-leave-table [rows]="visible()" [types]="t" [selfId]="auth.user()?.id ?? ''" [showPerson]="scope() === 'all'" [canDecide]="auth.can('leave.approve')" [canManage]="auth.can('hr.manage')" (approve)="pending.set({ l: $event, action: 'approve' })" (reject)="pending.set({ l: $event, action: 'reject' })" (cancel)="cancel($event)" />

      @if (applying()) {
        <app-leave-apply-dialog [types]="t" (done)="applied()" (cancelled)="applying.set(false)" />
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
export class LeavePage {
  private readonly api = inject(HrApiService);
  protected readonly auth = inject(AuthService);

  protected readonly statuses = LEAVE_STATUSES;
  protected readonly types = signal<LeaveType[] | null>(null);
  protected readonly balances = signal<LeaveBalance[]>([]);
  protected readonly rows = signal<LeaveApplication[]>([]);
  protected readonly failed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly applying = signal(false);
  protected readonly pending = signal<Pending>(null);
  protected readonly scope = signal<'mine' | 'all'>('mine');
  protected readonly status = signal<LeaveStatus | ''>('');
  protected readonly canSeeAll = computed(() => this.auth.can('leave.approve') || this.auth.can('hr.view'));
  protected readonly visible = computed(() => {
    const me = this.auth.user()?.id;
    const all = this.scope() === 'all';
    return this.rows().filter((l) => (all || l.userId === me) && (!all || !this.status() || l.status === this.status()));
  });

  constructor() {
    this.load();
  }

  private load(): void {
    forkJoin({ types: this.api.leaveTypes(), balances: this.api.balances(), rows: this.api.leave() }).subscribe({
      next: ({ types, balances, rows }) => {
        this.types.set(types);
        this.balances.set(balances);
        this.rows.set(rows);
      },
      error: () => this.failed.set(true),
    });
  }

  protected applied(): void {
    this.applying.set(false);
    this.load();
  }

  protected decide(p: NonNullable<Pending>, note: string): void {
    this.pending.set(null);
    this.act(this.api.decide(p.l.id, p.action, note));
  }

  protected cancel(l: LeaveApplication): void {
    this.act(this.api.cancel(l.id));
  }

  private act(call: ReturnType<HrApiService['cancel']>): void {
    this.error.set(null);
    call.subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e) ?? 'Error') });
  }
}
