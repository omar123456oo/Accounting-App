import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { environment } from '../../../environments/environment';
import { NAV_ITEMS } from './nav.config';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="sidebar p-3" [attr.aria-label]="'nav.main' | translate">
      <div class="brand d-flex align-items-center gap-2 mb-4 px-2"><span class="brand-mark" aria-hidden="true"><i class="fa-solid fa-calculator"></i></span><span class="fw-bold">{{ 'app.name' | translate }}</span></div>
      <ul class="nav nav-pills flex-column flex-nowrap gap-1">
        @for (item of items(); track item.route) {
          @if (item.heading) {
            <li class="nav-item mt-3 px-3 pb-1 heading" role="presentation">{{ item.heading | translate }}</li>
          }
          <li class="nav-item">
            <a class="nav-link" [routerLink]="item.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.route === '/app' }">
              @if (item.icon) {
                <i class="fa-solid fa-{{ item.icon }} fa-fw me-2 nav-icon" aria-hidden="true"></i>
              }
              {{ item.labelKey | translate }}
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    .sidebar {
      inline-size: 15.5rem;
      block-size: 100vh;
      position: sticky;
      inset-block-start: 0;
      overflow-y: auto;
      background: var(--app-sidebar-bg);
      color: var(--app-sidebar-text);
    }
    .brand {
      color: #fff;
      font-size: 1.15rem;
      padding-block: 0.25rem;
    }
    .brand-mark {
      display: grid;
      place-items: center;
      inline-size: 2.1rem;
      block-size: 2.1rem;
      border-radius: 0.6rem;
      background: linear-gradient(135deg, #6366f1, #4338ca);
      color: #fff;
      font-size: 0.95rem;
    }
    .heading {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #64748b;
    }
    .nav-link {
      color: var(--app-sidebar-text);
      font-size: 0.9rem;
      padding-block: 0.5rem;
      transition: background-color 0.15s, color 0.15s;
    }
    .nav-link:hover {
      background: rgb(255 255 255 / 8%);
      color: #fff;
    }
    .nav-link.active {
      background: #4f46e5;
      color: #fff;
      box-shadow: 0 2px 8px rgb(79 70 229 / 40%);
    }
    .nav-icon {
      opacity: 0.8;
    }
  `,
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  /** Permission-filtered entries; the first visible entry of a group carries the group heading. */
  protected readonly items = computed(() => {
    const visible = NAV_ITEMS.filter((i) => (!i.liveOnly || !environment.useMockApi) && (!i.permission || this.auth.can(i.permission)));
    return visible.map((item, index) => ({ ...item, heading: item.groupKey && visible[index - 1]?.groupKey !== item.groupKey ? item.groupKey : null }));
  });
}
