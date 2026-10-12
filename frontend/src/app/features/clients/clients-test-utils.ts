import { HttpClient, provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { EnvironmentProviders, Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { mockApiInterceptor } from '../../core/mock-api/mock-api.interceptor';

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
