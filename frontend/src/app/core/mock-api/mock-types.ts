import { FieldErrors } from './mock-clients-rules';
import { MockMessageKey } from './mock-messages';
import { DemoUser } from './mock-users';

export interface MockRequest {
  method: string;
  /** Path below /api/v1/staff, e.g. "clients/c-001/contacts". */
  path: string;
  query: URLSearchParams;
  /** JSON body, or the fields of a multipart form (a file arrives as a Blob under its field name). */
  body: Record<string, unknown>;
  /** The Idempotency-Key request header, when the client sent one. */
  idempotencyKey?: string;
}

export interface MockResult {
  status: number;
  /** JSON-serialisable data, or a Blob for downloads. */
  body?: unknown;
  errors?: FieldErrors;
  error?: MockMessageKey;
}

/** A slice of the staff API. Handlers authorise exactly as the real server must; the UI only hides controls. */
export interface MockModule {
  handle(req: MockRequest, user: DemoUser): MockResult | Promise<MockResult>;
}

export const fail = (status: number, error: MockMessageKey): MockResult => ({ status, error });
export const invalid = (errors: FieldErrors): MockResult => ({ status: 422, errors });
export const ok = (body: unknown, status = 200): MockResult => ({ status, body });
export const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Null when the user holds the permission, otherwise the 403 result. */
export function need(user: DemoUser, permission: string): MockResult | null {
  return user.profile.permissions.includes(permission) ? null : fail(403, 'forbidden');
}

export interface PageQuery {
  page: number;
  pageSize: number;
  dir: 1 | -1;
}

export function pageQuery(q: URLSearchParams): PageQuery {
  return {
    page: Math.max(1, Number(q.get('page')) || 1),
    pageSize: Math.min(100, Math.max(1, Number(q.get('pageSize')) || 10)),
    dir: q.get('dir') === 'desc' ? -1 : 1,
  };
}

export function paged<T>(rows: T[], p: PageQuery): MockResult {
  return ok({ data: rows.slice((p.page - 1) * p.pageSize, p.page * p.pageSize), meta: { page: p.page, pageSize: p.pageSize, total: rows.length } });
}
