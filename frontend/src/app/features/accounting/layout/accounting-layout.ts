import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { LedgerContext } from '../ledger-context';

const TABS = [
  { key: 'accounts', permission: 'ledger.view' },
  { key: 'periods', permission: 'ledger.view' },
  { key: 'journals', permission: 'journals.view' },
  { key: 'reports', permission: 'reports.view' },
] as const;

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
      <nav [attr.aria-label]="'accounting.sections' | translate">
        <ul class="nav nav-tabs">
          @for (tab of tabs(); track tab.key) {
            <li class="nav-item">
              <a class="nav-link" [routerLink]="['/app/accounting', tab.key]" routerLinkActive="active" ariaCurrentWhenActive="page">{{ 'accounting.tabs.' + tab.key | translate }}</a>
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
  protected readonly tabs = computed(() => TABS.filter((t) => this.auth.can(t.permission)));

  constructor() {
    this.ctx.load(inject(ActivatedRoute).snapshot.queryParamMap.get('ledger'));
  }

  protected choose(id: string): void {
    this.ctx.select(id);
    // An entry belongs to one ledger, so leave an entry's page for the list when the books change.
    if (/\/journals\/[^/?]+/.test(this.router.url)) void this.router.navigate(['/app/accounting/journals']);
  }
}
