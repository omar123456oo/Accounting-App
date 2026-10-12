import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { NAV_ITEMS } from './nav.config';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="sidebar p-3" [attr.aria-label]="'nav.main' | translate">
      <div class="h5 mb-4">{{ 'app.name' | translate }}</div>
      <ul class="nav nav-pills flex-column gap-1">
        @for (item of items(); track item.route) {
          @if (item.heading) {
            <li class="nav-item mt-3 px-3 small fw-semibold text-body-secondary" role="presentation">{{ item.heading | translate }}</li>
          }
          <li class="nav-item">
            <a class="nav-link" [routerLink]="item.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.route === '/app' }">
              {{ item.labelKey | translate }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    .sidebar {
      inline-size: 15rem;
      block-size: 100%;
      background: var(--bs-tertiary-bg);
      border-inline-end: 1px solid var(--bs-border-color);
    }
  `,
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  /** Permission-filtered entries; the first visible entry of a group carries the group heading. */
  protected readonly items = computed(() => {
    const visible = NAV_ITEMS.filter((i) => !i.permission || this.auth.can(i.permission));
    return visible.map((item, index) => ({ ...item, heading: item.groupKey && visible[index - 1]?.groupKey !== item.groupKey ? item.groupKey : null }));
  });
}
