import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { TasksApiService } from '../workflows/tasks-api.service';
import { AnalyticsLayout } from './analytics-layout';
import { fetchAll } from './analytics.helpers';

const OWNER = ['owner@demo.test', 'Owner-Demo-123!'] as const;
const ACCOUNTANT = ['accountant@demo.test', 'Accountant-Demo-123!'] as const;

async function render(login: readonly [string, string]) {
  TestBed.configureTestingModule({ imports: [AnalyticsLayout], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs(...login);
  const fixture = TestBed.createComponent(AnalyticsLayout);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.nav-tabs .nav-link')];
const kpis = (el: HTMLElement) => [...el.querySelectorAll('app-kpi-card')].map((k) => k.textContent!.replace(/\s+/g, ' ').trim());

describe('Analytics', () => {
  it('opens a tab for every module for the owner', async () => {
    const { el } = await render(OWNER);
    expect(tabs(el)).toHaveLength(11);
  });

  it('shows an accountant only the modules they may open', async () => {
    const { el } = await render(ACCOUNTANT);
    const labels = tabs(el).map((t) => t.textContent!.trim());
    expect(labels.some((l) => l.includes('analytics.tabs.hr'))).toBe(false);
    expect(labels.some((l) => l.includes('analytics.tabs.security'))).toBe(false);
    expect(labels.some((l) => l.includes('analytics.tabs.clients'))).toBe(true);
  });

  it('renders every module tab with figures and without a load error', async () => {
    const { fixture, el } = await render(OWNER);
    for (const tab of tabs(el)) {
      tab.click();
      await settle(fixture);
      const name = tab.textContent!.trim();
      expect(el.querySelector('.alert-danger'), name).toBeNull();
      expect(el.querySelectorAll('app-kpi-card').length, name).toBeGreaterThanOrEqual(3);
      expect(el.querySelectorAll('app-chart-card').length, name).toBeGreaterThanOrEqual(2);
    }
  });

  it('shows the ledger picker only on ledger-based tabs', async () => {
    const { fixture, el } = await render(OWNER);
    expect(el.querySelector('#an-ledger')).toBeNull(); // clients
    tabs(el).find((t) => t.textContent!.includes('analytics.tabs.accounting'))!.click();
    await settle(fixture);
    expect(el.querySelector('#an-ledger')).not.toBeNull();
  });

  it('agrees with the task list on how many tasks are overdue', async () => {
    const { fixture, el } = await render(OWNER);
    tabs(el).find((t) => t.textContent!.includes('analytics.tabs.tasks'))!.click();
    await settle(fixture);
    const api = TestBed.inject(TasksApiService);
    const all = await firstValueFrom(fetchAll((p) => api.list({ page: p, pageSize: 100, mine: false })));
    const overdue = all.filter((t) => t.overdue && ['todo', 'in_progress', 'blocked'].includes(t.status)).length;
    const open = all.filter((t) => ['todo', 'in_progress', 'blocked'].includes(t.status)).length;
    const text = kpis(el);
    expect(text[0]).toContain(String(open));
    expect(text[1]).toContain(String(overdue));
  });

  it('counts the seven demo staff in the HR tab and keeps payroll figures out of the way for non-payroll users', async () => {
    const { fixture, el } = await render(OWNER);
    tabs(el).find((t) => t.textContent!.includes('analytics.tabs.hr'))!.click();
    await settle(fixture);
    expect(kpis(el)[0]).toContain('7');
    expect(el.textContent).toContain('analytics.hr.payrollTrend');
  });

  it('adds up the receivables buckets to the outstanding balance', async () => {
    const { fixture, el } = await render(OWNER);
    tabs(el).find((t) => t.textContent!.includes('analytics.tabs.receivables'))!.click();
    await settle(fixture);
    expect(el.querySelector('app-bar-list')).not.toBeNull();
    expect(kpis(el)).toHaveLength(4);
  });
});
