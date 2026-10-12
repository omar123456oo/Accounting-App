import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notify/notification.service';

/**
 * Central HTTP error policy. The error is always re-thrown so callers can react (422 field errors in
 * particular are left for the forms to map); this only adds the cross-cutting side effects.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        switch (true) {
          case error.status === 401 && req.url.endsWith('/auth/me'):
            // Session probe at startup: "not signed in" is a normal answer, the guards route the user.
            auth.clear();
            break;
          case error.status === 401: {
            const hadSession = auth.isAuthenticated();
            auth.clear();
            if (hadSession) {
              notify.error('errors.unauthorized');
            }
            if (!router.url.startsWith('/login')) {
              void router.navigate(['/login']);
            }
            break;
          }
          case error.status === 403:
            notify.error('errors.forbidden');
            break;
          case error.status === 423:
            notify.error('errors.locked');
            break;
          case error.status === 422:
            break;
          case error.status === 0 || error.status === 419 || error.status >= 500:
            notify.error('errors.generic');
            break;
        }
      }
      return throwError(() => error);
    }),
  );
};
