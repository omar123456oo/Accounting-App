import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of } from 'rxjs';
import { UserType } from './auth.models';
import { AuthService } from './auth.service';

const HOME: Record<UserType, string> = { staff: '/app', client: '/portal' };

function userTypeGuard(required: UserType): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const decide = () => {
      const user = auth.user();
      if (!user) {
        return router.createUrlTree(['/login']);
      }
      return user.type === required ? true : router.createUrlTree([HOME[user.type]]);
    };
    return auth.loaded() ? of(decide()) : auth.loadMe().pipe(map(decide));
  };
}

/** Staff-only area (/app). UX only; the API rejects the wrong user type with 403. */
export const staffGuard = userTypeGuard('staff');
/** Client-only area (/portal). UX only; the API rejects the wrong user type with 403. */
export const clientGuard = userTypeGuard('client');
