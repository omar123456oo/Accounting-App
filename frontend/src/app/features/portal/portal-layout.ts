import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';
import { NotificationBell } from '../engage/notification-bell';

/** The client portal shell: a top bar with the few places a client may go. The server scopes every page to their own client. */
@Component({
  selector: 'app-portal-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, LanguageSwitch, NotificationBell],
  template: `
    <header class="border-bottom bg-body no-print">
      <div class="container d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
        <a routerLink="/portal" class="fw-bold text-decoration-none fs-5"><i class="fa-solid fa-calculator me-2 text-primary" aria-hidden="true"></i>{{ 'portal.title' | translate }}</a>
        <div class="d-flex align-items-center gap-2">
          <app-notification-bell side="portal" />
          <app-language-switch />
          <span class="small text-body-secondary d-none d-md-inline">{{ auth.user()?.name }}</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" (click)="logout()">{{ 'nav.logout' | translate }}</button>
        </div>
      </div>
      <nav class="container" [attr.aria-label]="'portal.menu' | translate">
        <ul class="nav nav-tabs border-0 flex-nowrap overflow-auto">
          @for (t of tabs; track t.route) {
            <li class="nav-item">
              <a class="nav-link text-nowrap" [routerLink]="t.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: t.route === '/portal' }" ariaCurrentWhenActive="page">
                <i class="fa-solid fa-{{ t.icon }} fa-fw me-1" aria-hidden="true"></i>{{ t.label | translate }}
              </a>
            </li>
          }
        </ul>
      </nav>
    </header>
    <main class="container py-4" id="main-content" tabindex="-1">
      <router-outlet />
    </main>
  `,
})
export class PortalLayout {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly tabs = [
    { route: '/portal', label: 'portal.tabs.home', icon: 'house' },
    { route: '/portal/invoices', label: 'portal.tabs.invoices', icon: 'file-invoice-dollar' },
    { route: '/portal/documents', label: 'portal.tabs.documents', icon: 'folder-open' },
    { route: '/portal/tickets', label: 'portal.tabs.tickets', icon: 'comments' },
    { route: '/portal/appointments', label: 'portal.tabs.appointments', icon: 'calendar-check' },
  ];

  protected logout(): void {
    const go = () => void this.router.navigate(['/login']);
    this.auth.logout().subscribe({ complete: go, error: go });
  }
}
