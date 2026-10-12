import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

const REPORTS = ['trial-balance', 'general-ledger', 'journal-register'] as const;

@Component({
  selector: 'app-reports-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="mb-3 no-print" [attr.aria-label]="'accounting.reports.menu' | translate">
      <ul class="nav nav-pills">
        @for (r of reports; track r) {
          <li class="nav-item">
            <a class="nav-link" [routerLink]="['/app/accounting/reports', r]" routerLinkActive="active" ariaCurrentWhenActive="page">{{ 'accounting.reports.' + camel(r) | translate }}</a>
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class ReportsLayout {
  protected readonly reports = REPORTS;

  protected camel(name: string): string {
    return name.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());
  }
}
