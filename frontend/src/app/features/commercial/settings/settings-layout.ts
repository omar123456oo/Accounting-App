import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';

const SECTIONS = [
  { key: 'mappings', permission: 'mappings.manage' },
  { key: 'service-types', permission: 'mappings.manage' },
  { key: 'expense-categories', permission: 'mappings.manage' },
  { key: 'tax-rates', permission: 'tax.rates.manage' },
] as const;

/** Commercial settings: account mappings, service types, expense categories and tax rates. */
@Component({
  selector: 'app-commercial-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="mb-3 no-print" [attr.aria-label]="'commercial.settings.menu' | translate">
      <ul class="nav nav-pills">
        @for (s of sections(); track s.key) {
          <li class="nav-item">
            <a class="nav-link" [routerLink]="['/app/accounting/settings', s.key]" routerLinkActive="active" ariaCurrentWhenActive="page">{{ 'commercial.settings.' + s.key | translate }}</a>
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class SettingsLayout {
  private readonly auth = inject(AuthService);
  protected readonly sections = computed(() => SECTIONS.filter((s) => this.auth.can(s.permission)));
}
