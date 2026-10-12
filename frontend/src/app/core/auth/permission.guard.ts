import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NotificationService } from '../notify/notification.service';
import { AuthService } from './auth.service';

/** Reads the required permission from `route.data['permission']`. UX only; the API authorises for real. */
export const permissionGuard: CanActivateFn = (route) => {
  const permission = route.data['permission'] as string | undefined;
  if (!permission || inject(AuthService).can(permission)) {
    return true;
  }
  inject(NotificationService).error('errors.forbidden');
  return inject(Router).createUrlTree(['/app']);
};
