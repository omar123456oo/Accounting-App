import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';

@Component({
  selector: 'app-header',
  imports: [LanguageSwitch, TranslatePipe],
  styleUrl: './header.scss',
  template: `
    <header class="d-flex align-items-center justify-content-end gap-3 px-3 py-2 border-bottom bg-body">
      <app-language-switch />
      <div class="user-menu">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          aria-haspopup="true"
          [attr.aria-expanded]="open()"
          [attr.aria-label]="'nav.userMenu' | translate"
          (click)="open.set(!open())"
        >
          {{ auth.user()?.name }}
        </button>
        @if (open()) {
          <div class="panel card shadow-sm p-2" role="menu">
            <div class="small text-body-secondary px-2 pb-2">{{ 'nav.signedInAs' | translate }} {{ auth.user()?.name }}</div>
            <button type="button" class="btn btn-sm btn-light w-100 text-start" role="menuitem" (click)="logout()">
              {{ 'nav.logout' | translate }}
            </button>
          </div>
        }
      </div>
    </header>
  `,
})
export class Header {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);

  logout(): void {
    this.open.set(false);
    this.auth.logout().subscribe({ complete: () => void this.router.navigate(['/login']), error: () => void this.router.navigate(['/login']) });
  }
}
