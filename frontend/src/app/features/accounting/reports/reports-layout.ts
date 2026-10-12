import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';

/** The commercial reports need the document permissions on top of reports.view. */
const REPORTS = [
  { key: 'trial-balance' },
  { key: 'general-ledger' },
  { key: 'journal-register' },
  { key: 'ar-aging', permission: 'invoices.view' },
  { key: 'ap-aging', permission: 'bills.view' },
  { key: 'revenue', permission: 'invoices.view' },
  { key: 'reconciliation', permission: 'invoices.view' },
] as const;

@Component({
  selector: 'app-reports-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="mb-3 no-print" [attr.aria-label]="'accounting.reports.menu' | translate">
      <ul class="nav nav-pills">
        @for (r of reports(); track r.key) {
          <li class="nav-item">
            <a class="nav-link" [routerLink]="['/app/accounting/reports', r.key]" routerLinkActive="active" ariaCurrentWhenActive="page">{{ 'accounting.reports.' + camel(r.key) | translate }}</a>
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class ReportsLayout {
  private readonly auth = inject(AuthService);
  protected readonly reports = computed(() => REPORTS.filter((r) => !('permission' in r) || this.auth.can(r.permission)));

  protected camel(name: string): string {
    return name.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
  }
}
