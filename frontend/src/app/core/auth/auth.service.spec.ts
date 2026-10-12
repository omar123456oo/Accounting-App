import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

const USER = { id: '1', name: 'A', type: 'staff', permissions: ['journals.view'] };

describe('AuthService', () => {
  let auth: AuthService;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('fetches the CSRF cookie before posting the login', () => {
    let result: unknown;
    auth.login('a@b.c', 'pw').subscribe((u) => (result = u));
    ctrl.expectOne('/sanctum/csrf-cookie').flush(null);
    const login = ctrl.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({ email: 'a@b.c', password: 'pw' });
    login.flush({ user: USER });
    expect(result).toEqual(USER);
    expect(auth.user()).toEqual(USER);
    expect(auth.can('journals.view')).toBe(true);
    expect(auth.can('journals.post')).toBe(false);
  });

  it('sends the otp only when given', () => {
    auth.login('a@b.c', 'pw', '123456').subscribe();
    ctrl.expectOne('/sanctum/csrf-cookie').flush(null);
    const login = ctrl.expectOne('/api/v1/auth/login');
    expect(login.request.body).toEqual({ email: 'a@b.c', password: 'pw', otp: '123456' });
    login.flush({ user: USER });
  });

  it('never persists anything to web storage', () => {
    auth.login('a@b.c', 'pw').subscribe();
    ctrl.expectOne('/sanctum/csrf-cookie').flush(null);
    ctrl.expectOne('/api/v1/auth/login').flush({ user: USER });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('clears the user on logout even if the request fails', () => {
    auth.login('a@b.c', 'pw').subscribe();
    ctrl.expectOne('/sanctum/csrf-cookie').flush(null);
    ctrl.expectOne('/api/v1/auth/login').flush({ user: USER });
    auth.logout().subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/auth/logout').flush('x', { status: 500, statusText: 'err' });
    expect(auth.user()).toBeNull();
  });

  it('loadMe resolves to null on 401 and marks the service loaded', () => {
    let result: unknown = 'unset';
    auth.loadMe().subscribe((u) => (result = u));
    ctrl.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(result).toBeNull();
    expect(auth.loaded()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
  });
});
