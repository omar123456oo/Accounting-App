import { Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage, fieldErrors } from '../../core/http/api-errors';
import { CommentDialog } from '../../shared/components/comment-dialog/comment-dialog';
import { Modal } from '../../shared/components/modal/modal';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { BadgeTone, StatusBadge } from '../../shared/components/status-badge/status-badge';
import { HrmApiService } from './hrm-api.service';
import { CONTRACT_STATUSES, CONTRACT_TYPES, Contract, ContractStatus, EmployeeLite } from './hrm.models';

type DraftKey = 'employeeId' | 'type' | 'startDate' | 'endDate';
const TONE: Record<ContractStatus, BadgeTone> = { draft: 'secondary', active: 'success', renewed: 'info', expired: 'warning', terminated: 'danger' };

/** Contracts with their lifecycle: draft, activate, renew (continuous cover), terminate. Expiring contracts are flagged. */
@Component({
  selector: 'app-contracts-page',
  imports: [TranslatePipe, PageHeader, StatusBadge, Modal, CommentDialog],
  template: `
    <app-page-header [title]="'hrm.contracts.title' | translate">
      @if (canManage()) {
        <button type="button" class="btn btn-primary" (click)="openCreate()"><i class="fa-solid fa-plus me-1" aria-hidden="true"></i>{{ 'hrm.contracts.new' | translate }}</button>
      }
    </app-page-header>
    <div class="d-flex flex-wrap gap-3 align-items-end mb-3">
      <div>
        <label for="ct-status" class="form-label">{{ 'hrm.org.status' | translate }}</label>
        <select id="ct-status" class="form-select" [value]="status()" (change)="status.set($any($event.target).value); load()">
          <option value="">{{ 'tickets.anyStatus' | translate }}</option>
          @for (s of statuses; track s) { <option [value]="s">{{ 'hrm.contracts.statuses.' + s | translate }}</option> }
        </select>
      </div>
      <div class="form-check form-switch mb-2">
        <input id="ct-exp" type="checkbox" role="switch" class="form-check-input" [checked]="expiring()" (change)="expiring.set($any($event.target).checked); load()" />
        <label for="ct-exp" class="form-check-label">{{ 'hrm.contracts.expiringOnly' | translate }}</label>
      </div>
    </div>
    @if (error(); as e) { <div class="alert alert-danger" role="alert">{{ e }}</div> }
    <div class="table-responsive">
      <table class="table align-middle">
        <caption class="visually-hidden">{{ 'hrm.contracts.title' | translate }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'hrm.contracts.number' | translate }}</th>
            <th scope="col">{{ 'hrm.contracts.employee' | translate }}</th>
            <th scope="col">{{ 'hrm.contracts.type' | translate }}</th>
            <th scope="col">{{ 'hrm.contracts.period' | translate }}</th>
            <th scope="col">{{ 'hrm.org.status' | translate }}</th>
            <th scope="col"><span class="visually-hidden">{{ 'common.actions' | translate }}</span></th>
          </tr>
        </thead>
        <tbody>
          @for (c of rows(); track c.id) {
            <tr>
              <td dir="ltr">{{ c.number }}</td>
              <td>{{ nameOf(c.employeeId) }}</td>
              <td>{{ 'hrm.contracts.types.' + c.type | translate }}</td>
              <td dir="ltr">
                {{ c.startDate }} → {{ c.endDate ?? '∞' }}
                @if (c.status === 'active' && c.daysToEnd !== null && c.daysToEnd <= c.alertDays) {
                  <div class="small text-warning-emphasis">{{ 'hrm.contracts.endsIn' | translate: { n: c.daysToEnd } }}</div>
                }
              </td>
              <td><app-status-badge [label]="'hrm.contracts.statuses.' + c.status | translate" [tone]="tone[c.status]" /></td>
              <td class="text-end text-nowrap">
                @if (canManage()) {
                  @if (c.status === 'draft') {
                    <button type="button" class="btn btn-success btn-sm" (click)="act(c, 'activate')">{{ 'hrm.contracts.activate' | translate }}<span class="visually-hidden"> {{ c.number }}</span></button>
                  }
                  @if (c.status === 'active') {
                    @if (c.endDate) {
                      <button type="button" class="btn btn-outline-primary btn-sm me-1" (click)="renewing.set(c); renewEnd.set('')">{{ 'hrm.contracts.renew' | translate }}<span class="visually-hidden"> {{ c.number }}</span></button>
                    }
                    <button type="button" class="btn btn-outline-danger btn-sm" (click)="terminating.set(c)">{{ 'hrm.contracts.terminate' | translate }}<span class="visually-hidden"> {{ c.number }}</span></button>
                  }
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="text-center text-body-secondary py-4">{{ 'hrm.contracts.none' | translate }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (creating()) {
      <app-modal [title]="'hrm.contracts.new' | translate" (closed)="creating.set(false)">
        <form (submit)="$event.preventDefault(); create()">
          <div class="mb-3">
            <label for="nc-emp" class="form-label">{{ 'hrm.contracts.employee' | translate }}</label>
            <select id="nc-emp" class="form-select" [value]="draft().employeeId ?? ''" (change)="patch('employeeId', $any($event.target).value)" [class.is-invalid]="!!errors()['employeeId']">
              <option value="">-</option>
              @for (e of employees(); track e.id) { <option [value]="e.id">{{ e.employeeNo }} · {{ e.firstName }} {{ e.lastName }}</option> }
            </select>
            @if (errors()['employeeId']; as m) { <div class="invalid-feedback d-block" role="alert">{{ m }}</div> }
          </div>
          <div class="mb-3">
            <label for="nc-type" class="form-label">{{ 'hrm.contracts.type' | translate }}</label>
            <select id="nc-type" class="form-select" [value]="draft().type ?? ''" (change)="patch('type', $any($event.target).value)" [class.is-invalid]="!!errors()['type']">
              <option value="">-</option>
              @for (t of types; track t) { <option [value]="t">{{ 'hrm.contracts.types.' + t | translate }}</option> }
            </select>
            @if (errors()['type']; as m) { <div class="invalid-feedback d-block" role="alert">{{ m }}</div> }
          </div>
          <div class="row g-3 mb-3">
            <div class="col-6">
              <label for="nc-start" class="form-label">{{ 'hrm.contracts.start' | translate }}</label>
              <input id="nc-start" type="date" class="form-control" dir="ltr" [value]="draft().startDate ?? ''" (input)="patch('startDate', $any($event.target).value)" [class.is-invalid]="!!errors()['startDate']" />
              @if (errors()['startDate']; as m) { <div class="invalid-feedback d-block" role="alert">{{ m }}</div> }
            </div>
            <div class="col-6">
              <label for="nc-end" class="form-label">{{ 'hrm.contracts.end' | translate }}</label>
              <input id="nc-end" type="date" class="form-control" dir="ltr" [value]="draft().endDate ?? ''" (input)="patch('endDate', $any($event.target).value)" [class.is-invalid]="!!errors()['endDate']" />
              @if (errors()['endDate']; as m) { <div class="invalid-feedback d-block" role="alert">{{ m }}</div> }
            </div>
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-outline-secondary" (click)="creating.set(false)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
    @if (renewing(); as c) {
      <app-modal [title]="'hrm.contracts.renew' | translate" (closed)="renewing.set(null)">
        <form (submit)="$event.preventDefault(); renew(c)">
          <p class="small text-body-secondary">{{ 'hrm.contracts.renewHint' | translate: { number: c.number } }}</p>
          <label for="rn-end" class="form-label">{{ 'hrm.contracts.end' | translate }}</label>
          <input id="rn-end" type="date" class="form-control" dir="ltr" [value]="renewEnd()" (input)="renewEnd.set($any($event.target).value)" [class.is-invalid]="!!errors()['endDate']" />
          @if (errors()['endDate']; as m) { <div class="invalid-feedback d-block" role="alert">{{ m }}</div> }
          @if (errors()['status']; as m) { <div class="alert alert-danger mt-3" role="alert">{{ m }}</div> }
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" (click)="renewing.set(null)">{{ 'common.cancel' | translate }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'hrm.contracts.renew' | translate }}</button>
          </div>
        </form>
      </app-modal>
    }
    @if (terminating(); as c) {
      <app-comment-dialog [title]="'hrm.contracts.terminate' | translate" [message]="c.number" [label]="'hrm.contracts.reason' | translate" [confirmLabel]="'hrm.contracts.terminate' | translate" [required]="true" [danger]="true" (confirmed)="terminate(c, $event)" (cancelled)="terminating.set(null)" />
    }
  `,
})
export class ContractsPage {
  private readonly api = inject(HrmApiService);
  private readonly auth = inject(AuthService);
  protected readonly statuses = CONTRACT_STATUSES;
  protected readonly types = CONTRACT_TYPES;
  protected readonly tone = TONE;
  protected readonly canManage = computed(() => this.auth.can('hr.contracts.manage'));
  protected readonly rows = signal<Contract[]>([]);
  protected readonly employees = signal<EmployeeLite[]>([]);
  protected readonly status = signal('');
  protected readonly expiring = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  protected readonly creating = signal(false);
  protected readonly draft = signal<Partial<Record<DraftKey, string>>>({});
  protected readonly renewing = signal<Contract | null>(null);
  protected readonly renewEnd = signal('');
  protected readonly terminating = signal<Contract | null>(null);
  private readonly names = computed(() => new Map(this.employees().map((e) => [e.id, `${e.firstName} ${e.lastName}`])));

  constructor() {
    this.api.employees({ pageSize: 100 }).subscribe((p) => this.employees.set(p.data));
    this.load();
  }

  protected nameOf(id: string): string {
    return this.names().get(id) ?? id;
  }

  protected load(): void {
    this.api.contracts({ status: this.status() as ContractStatus | '', ...(this.expiring() ? { expiringInDays: 60 } : {}), pageSize: 100 }).subscribe({ next: (p) => this.rows.set(p.data), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }

  protected openCreate(): void {
    this.errors.set({});
    this.draft.set({});
    this.creating.set(true);
  }

  protected patch(key: DraftKey, value: string): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  private done(): void {
    this.busy.set(false);
    this.creating.set(false);
    this.renewing.set(null);
    this.load();
  }

  private failed(e: unknown): void {
    this.busy.set(false);
    this.errors.set(fieldErrors(e));
    if (!Object.keys(fieldErrors(e)).length) this.error.set(apiErrorMessage(e));
  }

  protected create(): void {
    this.busy.set(true);
    const d = this.draft();
    this.api.createContract({ employeeId: d.employeeId ?? '', type: d.type ?? '', startDate: d.startDate ?? '', ...(d.endDate ? { endDate: d.endDate } : {}) }).subscribe({ next: () => this.done(), error: (e: unknown) => this.failed(e) });
  }

  protected act(c: Contract, action: 'activate'): void {
    this.error.set(null);
    this.api.contractAction(c.id, action).subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(fieldErrors(e)['startDate'] ?? fieldErrors(e)['status'] ?? apiErrorMessage(e)) });
  }

  protected renew(c: Contract): void {
    this.busy.set(true);
    this.errors.set({});
    this.api.contractAction(c.id, 'renew', { endDate: this.renewEnd() }).subscribe({ next: () => this.done(), error: (e: unknown) => this.failed(e) });
  }

  protected terminate(c: Contract, reason: string): void {
    this.terminating.set(null);
    this.api.contractAction(c.id, 'terminate', { reason }).subscribe({ next: () => this.load(), error: (e: unknown) => this.error.set(apiErrorMessage(e)) });
  }
}
