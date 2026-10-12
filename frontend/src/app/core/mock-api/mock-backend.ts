import { HttpErrorResponse, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, from, of, switchMap, throwError } from 'rxjs';
import { AuthUser } from '../auth/auth.models';
import { DEMO_OTP, DEMO_USERS, DemoUser } from './mock-users';
import { MockStaff } from './mock-staff';
import { MockResult } from './mock-types';
import { MockMessageKey, mockMessage } from './mock-messages';

const API = '/api/v1/auth';
const STAFF_API = '/api/v1/staff/';
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const COOKIE = 'XSRF-TOKEN';
const HEADER = 'X-XSRF-TOKEN';

interface Body {
  email?: string;
  password?: string;
  otp?: string;
}

/** In-memory implementation of the Task 3 auth contracts. The session lives and dies with the page. */
export class MockBackend {
  private sessionUserId: string | null = null;
  private readonly failures = new Map<string, number>();
  private readonly lockedUntil = new Map<string, number>();
  private readonly mfaEnabled = new Set(DEMO_USERS.filter((u) => u.mfaEnabled).map((u) => u.profile.id));
  private mfaPending = false;
  private lang: string | null = null;
  private readonly staff = new MockStaff();

  /** Returns null when the URL is not served by the mock so the request can go on to the network. */
  handle(req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> | null {
    const path = new URL(req.url, 'http://mock.local').pathname;
    if (path !== '/sanctum/csrf-cookie' && !path.startsWith('/api/')) {
      return null;
    }
    this.lang = req.headers.get('Accept-Language');
    return this.route(req, path);
  }

  private route(req: HttpRequest<unknown>, path: string): Observable<HttpEvent<unknown>> {
    if (path === '/sanctum/csrf-cookie' && req.method === 'GET') {
      document.cookie = `${COOKIE}=${crypto.randomUUID()}; path=/; SameSite=Lax`;
      return this.ok(null, 204);
    }
    if (req.method !== 'GET' && !this.csrfValid(req)) {
      return this.fail(419, 'csrf');
    }
    if (path.startsWith(STAFF_API) && this.staff.serves(path.slice(STAFF_API.length))) {
      const request = { method: req.method, path: path.slice(STAFF_API.length), query: new URL(req.urlWithParams, 'http://mock.local').searchParams, body: this.bodyOf(req.body), idempotencyKey: req.headers.get('Idempotency-Key') ?? undefined };
      return this.withUser((u) => {
        const result = this.staff.handle(request, u);
        return result instanceof Promise ? from(result).pipe(switchMap((r) => this.respond(r))) : this.respond(result);
      });
    }
    const body = (req.body ?? {}) as Body;
    switch (`${req.method} ${path}`) {
      case `POST ${API}/login`:
        return this.login(body);
      case `POST ${API}/logout`:
        this.sessionUserId = null;
        return this.ok(null, 204);
      case `GET ${API}/me`:
        return this.withUser((u) => this.ok({ user: u.profile }));
      case `POST ${API}/mfa/setup`:
        return this.withUser((u) => {
          this.mfaPending = true;
          const secret = 'JBSWY3DPEHPK3PXP';
          return this.ok({
            secret,
            otpauth_url: `otpauth://totp/Accounting:${encodeURIComponent(u.email)}?secret=${secret}&issuer=Accounting`,
          });
        });
      case `POST ${API}/mfa/confirm`:
        return this.withUser((u) => this.confirmMfa(u, body.otp));
      default:
        return this.fail(404, 'notFound');
    }
  }

  private login(body: Body): Observable<HttpEvent<unknown>> {
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !body.password) {
      const errors: Record<string, MockMessageKey[]> = {};
      if (!email) errors['email'] = ['required'];
      if (!body.password) errors['password'] = ['required'];
      return this.invalid(errors);
    }
    if ((this.lockedUntil.get(email) ?? 0) > Date.now()) {
      return this.fail(423, 'locked');
    }
    const user = DEMO_USERS.find((u) => u.email === email);
    if (!user || user.password !== body.password) {
      return this.recordFailure(email, { email: ['invalidCredentials'] });
    }
    if (this.mfaEnabled.has(user.profile.id)) {
      if (!body.otp) {
        return this.invalid({ otp: ['otpRequired'] });
      }
      if (body.otp !== DEMO_OTP) {
        return this.recordFailure(email, { otp: ['otpInvalid'] });
      }
    }
    this.failures.delete(email);
    this.sessionUserId = user.profile.id;
    return this.ok({ user: this.profileOf(user) });
  }

  private recordFailure(email: string, errors: Record<string, MockMessageKey[]>): Observable<HttpEvent<unknown>> {
    const count = (this.failures.get(email) ?? 0) + 1;
    this.failures.set(email, count);
    if (count >= MAX_FAILURES) {
      this.lockedUntil.set(email, Date.now() + LOCK_MS);
      this.failures.delete(email);
    }
    return this.invalid(errors);
  }

  private confirmMfa(user: DemoUser, otp: string | undefined): Observable<HttpEvent<unknown>> {
    if (!this.mfaPending || otp !== DEMO_OTP) {
      return this.invalid({ otp: [otp ? 'otpInvalid' : 'otpRequired'] });
    }
    this.mfaPending = false;
    this.mfaEnabled.add(user.profile.id);
    return this.ok({ confirmed: true });
  }

  /** A multipart upload becomes a record: plain fields as strings, `name[]` fields as arrays, files as Blobs. */
  private bodyOf(body: unknown): Record<string, unknown> {
    if (!(body instanceof FormData)) return (body ?? {}) as Record<string, unknown>;
    const record: Record<string, unknown> = {};
    body.forEach((value, key) => {
      if (key.endsWith('[]')) {
        const name = key.slice(0, -2);
        record[name] = [...((record[name] as unknown[] | undefined) ?? []), value];
      } else {
        record[key] = value;
      }
    });
    return record;
  }

  private profileOf(user: DemoUser): AuthUser {
    return { ...user.profile, permissions: [...user.profile.permissions] };
  }

  private withUser(fn: (user: DemoUser) => Observable<HttpEvent<unknown>>): Observable<HttpEvent<unknown>> {
    const user = DEMO_USERS.find((u) => u.profile.id === this.sessionUserId);
    return user ? fn(user) : this.fail(401, 'unauthenticated');
  }

  private csrfValid(req: HttpRequest<unknown>): boolean {
    const cookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    return !!cookie && req.headers.get(HEADER) === cookie;
  }

  private respond(r: MockResult): Observable<HttpEvent<unknown>> {
    if (r.errors) return this.invalid(r.errors);
    if (r.error) return this.fail(r.status, r.error);
    return this.ok(r.body ?? null, r.status);
  }

  private ok(body: unknown, status = 200): Observable<HttpEvent<unknown>> {
    return of(new HttpResponse({ status, body }));
  }

  private invalid(errors: Record<string, MockMessageKey[]>): Observable<HttpEvent<unknown>> {
    const localized = Object.fromEntries(
      Object.entries(errors).map(([field, keys]) => [field, keys.map((k) => mockMessage(this.lang, k))]),
    );
    return this.error(422, { message: Object.values(localized)[0]?.[0], errors: localized });
  }

  private fail(status: number, key: MockMessageKey): Observable<HttpEvent<unknown>> {
    return this.error(status, { message: mockMessage(this.lang, key) });
  }

  private error(status: number, body: unknown): Observable<HttpEvent<unknown>> {
    return throwError(() => new HttpErrorResponse({ status, error: body }));
  }
}
