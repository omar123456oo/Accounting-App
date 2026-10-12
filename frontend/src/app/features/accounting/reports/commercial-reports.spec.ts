import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { AgingReportPage } from './aging-report';
import { ReconciliationReportPage } from './reconciliation-report';
import { RevenueReportPage } from './revenue-report';

async function render<T>(component: new () => T, data: Record<string, unknown> = {}, ledger = 'le-firm') {
  TestBed.configureTestingModule({ imports: [component], providers: clientTestProviders([{ provide: ActivatedRoute, useValue: { snapshot: { data, paramMap: { get: () => null }, queryParamMap: { get: () => null } } } }]) });
  TestBed.inject(LanguageService).use('en');
  await signInAs('chief@demo.test', 'Chief-Demo-123!');
  await activateLedger(ledger);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Receivables and payables aging', () => {
  it('buckets the open invoices by due date against the mock clock and expands to the documents', async () => {
    const { fixture, el } = await render(AgingReportPage, { side: 'ar' });
    expect(el.querySelector('#aging-total-current')!.textContent).toBe('10,259.99');
    expect(el.querySelector('#aging-total-d31_60')!.textContent).toBe('48,800.00');
    expect(el.querySelector('#aging-total-d90_plus')!.textContent).toBe('3,420.00');
    expect(el.querySelector('#aging-total')!.textContent).toBe('62,479.99');
    expect(el.textContent).not.toContain('INV-2026-000003');
    el.querySelector<HTMLButtonElement>('tbody button')!.click();
    await settle(fixture);
    const link = el.querySelector<HTMLAnchorElement>('tr.table-light a')!;
    expect(link.getAttribute('href')).toMatch(/\/app\/invoicing\/invoices\/inv-/);
    expect(el.querySelector('tbody button')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('ages payables from the supplier side', async () => {
    const { el } = await render(AgingReportPage, { side: 'ap' });
    expect(el.querySelector('#aging-total')!.textContent).not.toBe('0.00');
    expect(el.querySelector('a[href*="/app/payables/bills/"]')).toBeFalsy();
    expect(el.textContent).toContain('commercial.aging.ap.title');
  });
});

describe('Revenue report', () => {
  it('lists posted revenue by client with a total, and can regroup by service', async () => {
    const { fixture, el } = await render(RevenueReportPage);
    expect(el.textContent).toContain('accounting.reports.postedOnly');
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(2);
    const total = el.querySelector('#revenue-total')!.textContent;
    const by = el.querySelector<HTMLSelectElement>('#rev-by')!;
    by.value = 'service';
    by.dispatchEvent(new Event('change'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('#revenue-total')!.textContent).toBe(total);
    expect(el.textContent).toContain('Bookkeeping');
  });
});

describe('Subledger reconciliation', () => {
  it('states in words that each subledger equals its control account', async () => {
    const { el } = await render(ReconciliationReportPage);
    expect(el.querySelector('#recon-status')!.textContent).toContain('commercial.reconciliation.allOk');
    expect(el.querySelectorAll('#recon-sentences li')).toHaveLength(5);
    expect(el.querySelector('#recon-ar')!.textContent).toContain('commercial.reconciliation.rowOk');
    expect(el.querySelector('#recon-ar a, table a')).toBeTruthy();
  });
});
