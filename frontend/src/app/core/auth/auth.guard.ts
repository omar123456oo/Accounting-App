import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of } from 'rxjs';
import { AuthService } from './auth.service';

/** UX only: sends anonymous visitors to /login. The server enforces access on every request. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const decide = () => (auth.isAuthenticated() ? true : router.createUrlTree(['/login']));
  return auth.loaded() ? of(decide()) : auth.loadMe().pipe(map(decide));
};
