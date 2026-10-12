import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { LedgerContext } from '../ledger-context';
import { ACCOUNTING_FRAME, FrameConfig } from './frame';

/** Frame of every accounting page: which ledger the user is in, the section tabs, and the routed page. */
@Component({
  selector: 'app-accounting-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <div class="d-flex flex-wrap align-items-end gap-3 mb-3 no-print">
      <div>
        <label for="ledger-select" class="form-label mb-1">{{ 'accounting.ledger.label' | translate }}</label>
        <select id="ledger-select" class="form-select" [disabled]="ctx.entities().length === 0" (change)="choose($any($event.target).value)">
          @for (e of ctx.entities(); track e.id) {
            <option [value]="e.id" [selected]="e.id === ctx.activeId()">
              @if (e.type === 'firm') {
                {{ 'accounting.ledger.firm' | translate }}
              } @else {
                {{ 'accounting.ledger.client' | translate: { name: e.name } }}
              }
            </option>
          }
        </select>
      </div>
      <nav [attr.aria-label]="frame.sectionsKey | translate">
        <ul class="nav nav-tabs">
          @for (tab of tabs(); track tab.key) {
            <li class="nav-item">
              <a class="nav-link" [routerLink]="[frame.base, tab.key]" routerLinkActive="active" ariaCurrentWhenActive="page">{{ frame.tabPrefix + tab.key | translate }}</a>
            </li>
          }
        </ul>
      </nav>
    </div>
    @if (ctx.failed()) {
      <div class="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
        <span>{{ 'accounting.ledger.loadFailed' | translate }}</span>
        <button type="button" class="btn btn-outline-danger btn-sm" (click)="ctx.load()">{{ 'common.retry' | translate }}</button>
      </div>
    } @else if (!ctx.loaded()) {
      <div class="text-body-secondary" role="status">{{ 'common.loading' | translate }}</div>
    } @else if (!ctx.activeId()) {
      <div class="alert alert-secondary" role="status">{{ 'accounting.ledger.none' | translate }}</div>
    } @else {
      <!-- A fresh outlet per ledger: switching ledgers reloads the page with the new books. -->
      @for (id of [ctx.activeId()]; track id) {
        <router-outlet />
      }
    }
  `,
})
export class AccountingLayout {
  protected readonly ctx = inject(LedgerContext);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** The section frame comes from the route data; accounting is the default. */
  protected readonly frame: FrameConfig = (this.route.snapshot.data['frame'] as FrameConfig | undefined) ?? ACCOUNTING_FRAME;
  protected readonly tabs = computed(() => this.frame.tabs.filter((t) => (typeof t.permission === 'string' ? this.auth.can(t.permission) : t.permission.some((p) => this.auth.can(p)))));

  constructor() {
    this.ctx.load(this.route.snapshot.queryParamMap.get('ledger'));
  }

  protected choose(id: string): void {
    this.ctx.select(id);
    // A record belongs to one ledger, so leave its page for the section's list when the books change.
    const record = new RegExp(this.frame.recordPattern).exec(this.router.url);
    if (record) void this.router.navigate([this.frame.base, record[1]]);
  }
}
