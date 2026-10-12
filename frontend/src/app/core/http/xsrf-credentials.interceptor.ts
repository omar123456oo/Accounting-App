import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Sanctum SPA mode is cookie based: every API call must carry the session cookie.
 * The X-XSRF-TOKEN header itself is added by Angular's built-in XSRF support (see withXsrfConfiguration).
 */
export const xsrfCredentialsInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ withCredentials: true }));
