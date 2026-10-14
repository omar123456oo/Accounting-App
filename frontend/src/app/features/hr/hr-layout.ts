import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';

/** HR hub: tabs for what the signed-in person may open. Everyone gets leave and their own file; the rest follow permissions. */
@Component({
  selector: 'app-hr-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="mb-3 no-print" [attr.aria-label]="'hr.menu' | translate">
      <ul class="nav nav-pills">
        @for (t of tabs(); track t.route) {
          <li class="nav-item">
            <a class="nav-link" [routerLink]="t.route" routerLinkActive="active" ariaCurrentWhenActive="page">
              <i class="fa-solid fa-{{ t.icon }} fa-fw me-1" aria-hidden="true"></i>{{ t.label | translate }}
            </a>
          </li>
        }
      </ul>
    </nav>
    <router-outlet />
  `,
})
export class HrLayout {
  private readonly auth = inject(AuthService);
  protected readonly tabs = computed(() => {
    const me = this.auth.user()?.id ?? '';
    return [
      { route: '/app/hr/dashboard', label: 'hr.tabs.dashboard', icon: 'chart-pie', show: this.auth.can('hr.employees.view') },
      { route: '/app/hr/organization', label: 'hr.tabs.organization', icon: 'sitemap', show: this.auth.can('hr.employees.view') },
      { route: '/app/hr/contracts', label: 'hr.tabs.contracts', icon: 'file-contract', show: this.auth.can('hr.contracts.view') },
      { route: '/app/hr/leave', label: 'hr.tabs.leave', icon: 'calendar-check', show: true },
      { route: `/app/hr/employees/${me}`, label: 'hr.tabs.me', icon: 'id-badge', show: !this.auth.can('hr.view') },
      { route: '/app/hr/employees', label: 'hr.tabs.employees', icon: 'users', show: this.auth.can('hr.view') },
      { route: '/app/hr/payroll', label: 'hr.tabs.payroll', icon: 'money-check-dollar', show: this.auth.can('payroll.view') },
      { route: '/app/hr/settings', label: 'hr.tabs.settings', icon: 'sliders', show: this.auth.can('hr.manage') },
    ].filter((t) => t.show);
  });
}
