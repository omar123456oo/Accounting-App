import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notify/notification.service';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let notify: NotificationService;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([errorInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    notify = TestBed.inject(NotificationService);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  function fail(status: number, body: object = {}): { error?: { status: number; error: unknown } } {
    const out: { error?: { status: number; error: unknown } } = {};
    http.get('/api/v1/x').subscribe({ error: (e) => (out.error = e) });
    ctrl.expectOne('/api/v1/x').flush(body, { status, statusText: 'x' });
    return out;
  }
  const keys = () => notify.notifications().map((n) => n.messageKey);

  it('401 clears the session, tells a signed-in user and redirects to /login', () => {
    (auth as unknown as { state: { set(u: unknown): void } }).state.set({ id: '1', name: 'a', type: 'staff', permissions: [] });
    fail(401);
    expect(auth.user()).toBeNull();
    expect(keys()).toEqual(['errors.unauthorized']);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('401 for an anonymous probe redirects silently', () => {
    fail(401);
    expect(keys()).toEqual([]);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('a 401 from the startup session probe does not redirect or notify', () => {
    http.get('/api/v1/auth/me').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'x' });
    expect(keys()).toEqual([]);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('403, 423 and 5xx notify; 422 passes through untouched', () => {
    fail(403);
    fail(423);
    fail(500);
    expect(keys()).toEqual(['errors.forbidden', 'errors.locked', 'errors.generic']);
    notify.notifications().forEach((n) => notify.dismiss(n.id));
    const out = fail(422, { errors: { otp: ['required'] } });
    expect(keys()).toEqual([]);
    expect(out.error?.status).toBe(422);
    expect(out.error?.error).toEqual({ errors: { otp: ['required'] } });
  });
});
