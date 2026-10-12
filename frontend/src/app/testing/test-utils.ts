import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { EnvironmentProviders, Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { mockApiInterceptor } from '../core/mock-api/mock-api.interceptor';
import { DEMO_USERS } from '../core/mock-api/mock-users';

/** Test wiring: the real services talking to the in-memory mock API, translations rendered as their keys. */
export function clientTestProviders(extra: Provider[] = []): Array<Provider | EnvironmentProviders> {
  return [
    provideRouter([]),
    provideTranslateService(),
    provideHttpClient(withInterceptors([mockApiInterceptor]), withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
    ...extra,
  ];
}

export async function signInAs(email: string, password: string): Promise<void> {
  await firstValueFrom(TestBed.inject(HttpClient).get('/sanctum/csrf-cookie'));
  await firstValueFrom(TestBed.inject(AuthService).login(email, password));
}

export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

/** Just the HTTP stack on top of the in-memory mock API, for specs of API services. */
export function mockHttpProviders(): Array<Provider | EnvironmentProviders> {
  return [provideHttpClient(withInterceptors([mockApiInterceptor]), withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }))];
}

/** Logs the demo user in (replacing any earlier mock session) using the password from mock-users. */
export async function signInDemo(email: string): Promise<void> {
  const http = TestBed.inject(HttpClient);
  const user = DEMO_USERS.find((u) => u.email === email);
  if (!user) throw new Error(`unknown demo user ${email}`);
  await firstValueFrom(http.get('/sanctum/csrf-cookie'));
  await firstValueFrom(http.post('/api/v1/auth/login', { email, password: user.password }));
}

/** Resolves with the HttpErrorResponse of a request that must fail. */
export async function failure(request: Promise<unknown>): Promise<HttpErrorResponse> {
  try {
    await request;
  } catch (e) {
    return e as HttpErrorResponse;
  }
  throw new Error('expected the request to fail');
}

/** Makes `ledgerId` the active ledger of the accounting pages (the mock answers synchronously). */
export async function activateLedger(ledgerId: string): Promise<void> {
  const { LedgerContext } = await import('../features/accounting/ledger-context');
  const context = TestBed.inject(LedgerContext);
  context.load(ledgerId);
  if (context.activeId() !== ledgerId) throw new Error(`ledger ${ledgerId} is not available to this user`);
}
