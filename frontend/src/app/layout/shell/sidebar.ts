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
  protected readonly items = computed(() => NAV_ITEMS.filter((i) => !i.permission || this.auth.can(i.permission)));
}
