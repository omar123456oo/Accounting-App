import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEMO_OTP, DEMO_USERS } from './mock-users';
import { mockApiInterceptor } from './mock-api.interceptor';

const login = (http: HttpClient, body: object) => firstValueFrom(http.post<{ user: { type: string; permissions: string[] } }>('/api/v1/auth/login', body));
const csrf = (http: HttpClient) => firstValueFrom(http.get('/sanctum/csrf-cookie'));
async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as HttpErrorResponse).status;
  }
}

describe('mockApiInterceptor', () => {
  let http: HttpClient;
  const owner = DEMO_USERS.find((u) => u.profile.type === 'staff' && !u.mfaEnabled && u.profile.permissions.length > 3)!;

  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([mockApiInterceptor]),
          withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
        ),
      ],
    });
    http = TestBed.inject(HttpClient);
  });

  it('sets the CSRF cookie and rejects unsafe requests without it (419)', async () => {
    expect(await status(login(http, { email: owner.email, password: owner.password }))).toBe(419);
    await csrf(http);
    expect(document.cookie).toContain('XSRF-TOKEN=');
    expect(await status(login(http, { email: owner.email, password: owner.password }))).toBe(200);
  });

  it('logs in, serves /me from the in-memory session and logs out', async () => {
    await csrf(http);
    const res = await login(http, { email: owner.email, password: owner.password });
    expect(res.user.type).toBe('staff');
    expect(res.user.permissions).toContain('journals.post');
    expect((await firstValueFrom(http.get<{ user: { id: string } }>('/api/v1/auth/me'))).user.id).toBe(owner.profile.id);
    await firstValueFrom(http.post('/api/v1/auth/logout', {}));
    expect(await status(firstValueFrom(http.get('/api/v1/auth/me')))).toBe(401);
  });

  it('returns 422 with field errors for wrong credentials', async () => {
    await csrf(http);
    try {
      await login(http, { email: owner.email, password: 'wrong-password' });
      expect.unreachable();
    } catch (e) {
      const err = e as HttpErrorResponse;
      expect(err.status).toBe(422);
      expect(err.error.errors.email).toBeTruthy();
    }
  });

  it('locks the account after five failures with 423', async () => {
    await csrf(http);
    for (let i = 0; i < 5; i++) {
      expect(await status(login(http, { email: owner.email, password: 'wrong-password' }))).toBe(422);
    }
    expect(await status(login(http, { email: owner.email, password: owner.password }))).toBe(423);
  });

  it('requires an otp for MFA users (422 errors.otp) and accepts the demo code', async () => {
    const mfa = DEMO_USERS.find((u) => u.mfaEnabled)!;
    await csrf(http);
    try {
      await login(http, { email: mfa.email, password: mfa.password });
      expect.unreachable();
    } catch (e) {
      expect((e as HttpErrorResponse).error.errors.otp).toBeTruthy();
    }
    expect(await status(login(http, { email: mfa.email, password: mfa.password, otp: '000000' }))).toBe(422);
    expect(await status(login(http, { email: mfa.email, password: mfa.password, otp: DEMO_OTP }))).toBe(200);
  });

  it('sets up and confirms MFA for a signed-in user, and requires a session for it', async () => {
    await csrf(http);
    expect(await status(firstValueFrom(http.post('/api/v1/auth/mfa/setup', {})))).toBe(401);
    await login(http, { email: owner.email, password: owner.password });
    const setup = await firstValueFrom(http.post<{ secret: string; otpauth_url: string }>('/api/v1/auth/mfa/setup', {}));
    expect(setup.secret).toBeTruthy();
    expect(setup.otpauth_url).toContain('otpauth://totp/');
    expect(await status(firstValueFrom(http.post('/api/v1/auth/mfa/confirm', { otp: '000000' })))).toBe(422);
    expect(await status(firstValueFrom(http.post('/api/v1/auth/mfa/confirm', { otp: DEMO_OTP })))).toBe(200);
  });

  it('answers 404 for unknown API routes', async () => {
    expect(await status(firstValueFrom(http.get('/api/v1/staff/nothing')))).toBe(404);
  });
});
