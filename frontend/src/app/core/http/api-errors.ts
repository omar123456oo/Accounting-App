import { HttpErrorResponse } from '@angular/common/http';
import { ValidationErrorBody } from '../auth/auth.models';

/** The first human-readable message of a failed API call (already localised by the server), or null. */
export function apiErrorMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body = error.error as ValidationErrorBody | null;
  const first = Object.values(body?.errors ?? {})[0]?.[0];
  return first ?? body?.message ?? null;
}

/** Field errors of a 422 response, by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) return {};
  const errors = (error.error as ValidationErrorBody | null)?.errors ?? {};
  return Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, messages[0]]));
}
