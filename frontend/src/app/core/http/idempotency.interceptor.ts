import { HttpContext, HttpContextToken, HttpInterceptorFn } from '@angular/common/http';

/** Marks a request as one logical action that needs an Idempotency-Key. */
export const IDEMPOTENT = new HttpContextToken<boolean>(() => false);

/**
 * One key per HttpContext. The context is shared by every clone of a request and by every retry of the
 * same observable, so a retried action reuses its key while a new action (new context) gets a new one.
 */
const IDEMPOTENCY_KEY = new HttpContextToken<string>(() => crypto.randomUUID());

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Use as `http.post(url, body, { context: idempotentContext() })`, once per logical action. */
export function idempotentContext(): HttpContext {
  return new HttpContext().set(IDEMPOTENT, true);
}

export const idempotencyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.context.get(IDEMPOTENT) || !UNSAFE.has(req.method)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { 'Idempotency-Key': req.context.get(IDEMPOTENCY_KEY) } }));
};
