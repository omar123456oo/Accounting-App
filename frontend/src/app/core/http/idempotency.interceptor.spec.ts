import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { retry } from 'rxjs';
import { IDEMPOTENT, idempotencyInterceptor, idempotentContext } from './idempotency.interceptor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('idempotencyInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([idempotencyInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  it('adds a UUID Idempotency-Key to marked POSTs', () => {
    http.post('/api/v1/x', {}, { context: idempotentContext() }).subscribe();
    const req = ctrl.expectOne('/api/v1/x');
    expect(req.request.headers.get('Idempotency-Key')).toMatch(UUID);
    req.flush({});
  });

  it('does not touch unmarked requests or safe methods', () => {
    http.post('/api/v1/plain', {}).subscribe();
    expect(ctrl.expectOne('/api/v1/plain').request.headers.has('Idempotency-Key')).toBe(false);
    http.get('/api/v1/read', { context: idempotentContext() }).subscribe();
    expect(ctrl.expectOne('/api/v1/read').request.headers.has('Idempotency-Key')).toBe(false);
  });

  it('reuses the key when the same logical action is retried and changes it for a new action', () => {
    const action$ = http.post('/api/v1/journals', {}, { context: idempotentContext() }).pipe(retry(1));
    action$.subscribe({ error: () => undefined });
    const first = ctrl.expectOne('/api/v1/journals');
    const key = first.request.headers.get('Idempotency-Key');
    first.flush('boom', { status: 503, statusText: 'Unavailable' });
    const retried = ctrl.expectOne('/api/v1/journals');
    expect(retried.request.headers.get('Idempotency-Key')).toBe(key);
    retried.flush({});

    http.post('/api/v1/journals', {}, { context: idempotentContext() }).subscribe();
    const next = ctrl.expectOne('/api/v1/journals');
    expect(next.request.headers.get('Idempotency-Key')).not.toBe(key);
    next.flush({});
  });

  it('exposes the IDEMPOTENT token defaulting to false', () => {
    expect(IDEMPOTENT.defaultValue()).toBe(false);
  });
});
