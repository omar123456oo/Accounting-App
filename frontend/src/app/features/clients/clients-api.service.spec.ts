import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { mockApiInterceptor } from '../../core/mock-api/mock-api.interceptor';
import { DEMO_USERS } from '../../core/mock-api/mock-users';
import { ClientsApiService } from './clients-api.service';
import { ClientInput } from './client.models';

const VALID: ClientInput = {
  legalName: 'DEMO New Client',
  legalForm: 'company',
  address: 'Demo Street 99',
  fiscalYearStartMonth: 1,
  assignedAccountantIds: [],
};

async function failure(p: Promise<unknown>): Promise<HttpErrorResponse> {
  try {
    await p;
  } catch (e) {
    return e as HttpErrorResponse;
  }
  throw new Error('expected the request to fail');
}

describe('ClientsApiService on the mock API', () => {
  let api: ClientsApiService;
  let http: HttpClient;

  async function signIn(email: string) {
    const user = DEMO_USERS.find((u) => u.email === email)!;
    await firstValueFrom(http.get('/sanctum/csrf-cookie'));
    await firstValueFrom(http.post('/api/v1/auth/login', { email, password: user.password }));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockApiInterceptor]), withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })),
      ],
    });
    api = TestBed.inject(ClientsApiService);
    http = TestBed.inject(HttpClient);
  });

  it('requires a session (401) and the clients.view permission (403)', async () => {
    expect((await failure(firstValueFrom(api.list()))).status).toBe(401);
    await signIn('client@demo.test');
    expect((await failure(firstValueFrom(api.list()))).status).toBe(403);
  });

  it('returns only DEMO data, with server-style pagination metadata', async () => {
    await signIn('owner@demo.test');
    const page1 = await firstValueFrom(api.list({ page: 1, pageSize: 5 }));
    expect(page1.meta).toEqual({ page: 1, pageSize: 5, total: 12 });
    expect(page1.data).toHaveLength(5);
    const page3 = await firstValueFrom(api.list({ page: 3, pageSize: 5 }));
    expect(page3.data).toHaveLength(2);
    expect(page1.data.every((c) => c.legalName.startsWith('DEMO'))).toBe(true);
  });

  it('filters by q, status and legalForm and sorts', async () => {
    await signIn('owner@demo.test');
    const byName = await firstValueFrom(api.list({ q: 'nile' }));
    expect(byName.data.map((c) => c.legalName)).toContain('DEMO Nile Trading Co.');
    const active = await firstValueFrom(api.list({ status: 'active' }));
    expect(active.data.length).toBeGreaterThan(0);
    expect(active.data.every((c) => c.status === 'active')).toBe(true);
    const individuals = await firstValueFrom(api.list({ legalForm: 'individual' }));
    expect(individuals.data.every((c) => c.legalForm === 'individual')).toBe(true);
    const desc = await firstValueFrom(api.list({ sort: 'legalName', dir: 'desc', pageSize: 100 }));
    const names = desc.data.map((c) => c.legalName);
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });

  it('hides archived clients unless asked, and archive needs clients.archive', async () => {
    await signIn('owner@demo.test');
    await firstValueFrom(api.archive('c-009', true));
    expect((await firstValueFrom(api.list({ pageSize: 100 }))).meta.total).toBe(11);
    expect((await firstValueFrom(api.list({ pageSize: 100, includeArchived: true }))).meta.total).toBe(12);
  });

  it('creates a client as a lead and validates fields with 422', async () => {
    await signIn('owner@demo.test');
    const created = await firstValueFrom(api.create({ ...VALID, taxRegistrationNo: '123456789' }));
    expect(created.status).toBe('lead');
    const err = await failure(firstValueFrom(api.create({ ...VALID, legalName: '', taxRegistrationNo: 'abc' })));
    expect(err.status).toBe(422);
    expect(Object.keys(err.error.errors)).toEqual(expect.arrayContaining(['legalName', 'taxRegistrationNo']));
  });

  it('allows legal status transitions and rejects illegal ones with 422', async () => {
    await signIn('owner@demo.test');
    expect((await firstValueFrom(api.changeStatus('c-004', 'onboarding'))).status).toBe('onboarding');
    const skip = await failure(firstValueFrom(api.changeStatus('c-012', 'active')));
    expect(skip.status).toBe(422);
    expect(skip.error.errors.status).toBeTruthy();
    const fromClosed = await failure(firstValueFrom(api.changeStatus('c-008', 'active')));
    expect(fromClosed.status).toBe(422);
    expect((await firstValueFrom(api.changeStatus('c-001', 'suspended'))).status).toBe('suspended');
    expect((await firstValueFrom(api.changeStatus('c-001', 'active'))).status).toBe('active');
  });

  it('records change history for critical fields only', async () => {
    await signIn('owner@demo.test');
    await firstValueFrom(api.update('c-001', { legalName: 'DEMO Nile Renamed', industry: 'Other', assignedAccountantIds: ['u-accountant', 'u-owner'] }));
    await firstValueFrom(api.changeStatus('c-001', 'suspended'));
    const history = await firstValueFrom(api.history('c-001'));
    expect(history.map((h) => h.field).sort()).toEqual(['assignedAccountantIds', 'legalName', 'status']);
    const name = history.find((h) => h.field === 'legalName')!;
    expect(name).toMatchObject({ oldValue: 'DEMO Nile Trading Co.', newValue: 'DEMO Nile Renamed', changedBy: 'Demo Owner' });
  });

  it('scopes accountants without an office-wide role to their assigned clients', async () => {
    await signIn('accountant@demo.test');
    const page = await firstValueFrom(api.list({ pageSize: 100 }));
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((c) => c.assignedAccountantIds.includes('u-accountant'))).toBe(true);
    expect(page.data.map((c) => c.id)).not.toContain('c-004');
    expect((await failure(firstValueFrom(api.get('c-004')))).status).toBe(404);
    expect((await failure(firstValueFrom(api.history('c-004')))).status).toBe(404);
  });

  it('answers 403 when the permission is missing', async () => {
    await signIn('accountant@demo.test');
    expect((await failure(firstValueFrom(api.create(VALID)))).status).toBe(403);
    expect((await failure(firstValueFrom(api.archive('c-001', true)))).status).toBe(403);
  });

  it('manages sub-resources and keeps money as a string', async () => {
    await signIn('owner@demo.test');
    const dates = { startDate: '2026-01-01', endDate: '2026-12-31', renewalDate: '2026-11-01' };
    const bad = await failure(firstValueFrom(api.createSub('c-001', 'agreements', { ...dates, monthlyFee: '12.345', status: 'active' })));
    expect(bad.error.errors.monthlyFee).toBeTruthy();
    const made = await firstValueFrom(api.createSub<{ id: string; monthlyFee: string }>('c-001', 'agreements', { ...dates, monthlyFee: '1234567890123.10', status: 'active' }));
    expect(made.monthlyFee).toBe('1234567890123.10');
    expect((await firstValueFrom(api.listSub('c-001', 'agreements'))).length).toBe(2);
    await firstValueFrom(api.deleteSub('c-001', 'agreements', made.id));
    expect((await firstValueFrom(api.listSub('c-001', 'agreements'))).length).toBe(1);
  });
});
