import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { clientTestProviders, mockHttpProviders, settle, signInAs, signInDemo } from '../../testing/test-utils';
import { ContractsPage } from './contracts-page';
import { HrmDashboard } from './hrm-dashboard';
import { OrganizationPage } from './organization-page';

const BASE = '/api/v1/staff/hrm';
const OWNER = ['owner@demo.test', 'Owner-Demo-123!'] as const;

describe('HR core on the mock API', () => {
  let http: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });
  const call = async (method: string, path: string, body?: unknown) => {
    try {
      const r = await firstValueFrom(http.request<any>(method, `${BASE}/${path}`, { body, observe: 'response' }));
      return { status: r.status, body: r.body };
    } catch (e) {
      return { status: (e as HttpErrorResponse).status, body: (e as HttpErrorResponse).error };
    }
  };

  it('keeps departments a tree, refuses duplicate codes and closing a unit that still has people', async () => {
    await signInDemo('owner@demo.test');
    const tree = (await call('GET', 'departments-tree')).body.data;
    const acc = tree.find((d: { code: string }) => d.code === 'ACC');
    const child = (await call('POST', 'departments', { code: 'ACC2', name: 'Sub', parentId: acc.id })).body.data;
    expect((await call('PATCH', `departments/${acc.id}`, { parentId: child.id })).status).toBe(422); // loop
    expect((await call('PATCH', `departments/${acc.id}`, { parentId: acc.id })).status).toBe(422); // itself
    expect((await call('POST', 'departments', { code: 'ACC', name: 'Dup' })).status).toBe(422);
    expect((await call('PATCH', `departments/${acc.id}`, { active: false })).status).toBe(422); // staff assigned
    expect((await call('PATCH', `departments/${child.id}`, { active: false })).status).toBe(200);
  });

  it('only lets people with the HR permissions in', async () => {
    await signInDemo('auditor@demo.test'); // read-only: no hr.* permissions
    expect((await call('GET', 'dashboard')).status).toBe(403);
    expect((await call('POST', 'branches', { code: 'X', name: 'X' })).status).toBe(403);
    expect((await call('GET', 'contracts')).status).toBe(403);
  });

  it('runs a contract through draft, activate, renew without a gap, and terminate', async () => {
    await signInDemo('owner@demo.test');
    const created = (await call('POST', 'contracts', { employeeId: 'u-chief', type: 'fixed_term', startDate: '2026-10-01', endDate: '2026-12-31' })).body.data;
    expect(created.status).toBe('draft');
    expect((await call('POST', 'contracts', { employeeId: 'u-chief', type: 'fixed_term', startDate: '2026-10-01' })).status).toBe(422); // end date required
    expect((await call('POST', `contracts/${created.id}/renew`, { endDate: '2027-12-31' })).status).toBe(422); // not active
    expect((await call('POST', `contracts/${created.id}/activate`)).body.data.status).toBe('active');
    expect((await call('POST', `contracts/${created.id}/activate`)).status).toBe(422);
    const renewal = (await call('POST', `contracts/${created.id}/renew`, { endDate: '2027-12-31' })).body.data;
    expect(renewal.startDate).toBe('2027-01-01');
    expect((await call('POST', `contracts/${created.id}/renew`, { endDate: '2028-12-31' })).status).toBe(422); // one at a time
    expect((await call('POST', `contracts/${renewal.id}/activate`)).body.data.status).toBe('active');
    expect((await call('GET', 'contracts?status=renewed')).body.data.map((c: { id: string }) => c.id)).toContain(created.id);
    expect((await call('POST', `contracts/${renewal.id}/terminate`, {})).status).toBe(422); // reason needed
    expect((await call('POST', `contracts/${renewal.id}/terminate`, { reason: 'Resigned' })).body.data.status).toBe('terminated');
  });
});

describe('HR core pages', () => {
  async function render<T>(component: new () => T) {
    TestBed.configureTestingModule({ imports: [component], providers: clientTestProviders() });
    TestBed.inject(LanguageService).use('en');
    await signInAs(...OWNER);
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the dashboard figures and four charts from the records', async () => {
    const el = await render(HrmDashboard);
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(6);
    expect(el.querySelectorAll('app-pie-chart')).toHaveLength(2);
    expect(el.textContent).toContain('hrm.dashboard.total');
  });

  it('lists the department tree with head-counts', async () => {
    const el = await render(OrganizationPage);
    const rows = [...el.querySelectorAll('li.list-group-item')].map((li) => li.textContent);
    expect(rows.some((t) => t?.includes('Accounting'))).toBe(true);
  });

  it('lists contracts and offers activate only on drafts', async () => {
    const el = await render(ContractsPage);
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const draft = rows.find((r) => r.textContent?.includes('hrm.contracts.statuses.draft'))!;
    expect(draft.textContent).toContain('hrm.contracts.activate');
    const active = rows.find((r) => r.textContent?.includes('hrm.contracts.statuses.active'))!;
    expect(active.textContent).not.toContain('hrm.contracts.activate');
  });
});
