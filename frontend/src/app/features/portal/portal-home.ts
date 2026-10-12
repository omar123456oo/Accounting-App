import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageSwitch } from '../../shared/components/language-switch/language-switch';

@Component({
  selector: 'app-portal-home',
  imports: [TranslatePipe, LanguageSwitch],
  template: `
    <main class="container py-4">
      <div class="d-flex align-items-center justify-content-between mb-4">
        <h1 class="h4 mb-0">{{ 'portal.title' | translate }}</h1>
        <div class="d-flex gap-2">
          <app-language-switch />
          <button type="button" class="btn btn-outline-secondary btn-sm" (click)="logout()">{{ 'nav.logout' | translate }}</button>
        </div>
      </div>
      <p>{{ 'portal.welcome' | translate }} {{ auth.user()?.name }}</p>
      <div class="alert alert-info" role="status">{{ 'portal.laterPhases' | translate }}</div>
    </main>
  `,
})
export class PortalHome {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.auth.logout().subscribe({ complete: () => void this.router.navigate(['/login']), error: () => void this.router.navigate(['/login']) });
  }
}
