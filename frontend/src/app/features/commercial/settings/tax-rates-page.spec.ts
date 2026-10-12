import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { TaxRatesPage } from './tax-rates-page';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [TaxRatesPage], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs(email, password);
  await activateLedger('le-c-001');
  const fixture = TestBed.createComponent(TaxRatesPage);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('TaxRatesPage', () => {
  it('always shows the unverified banner and marks the shipped demo rates as drafts, in text', async () => {
    const { el } = await render('owner@demo.test', 'Owner-Demo-123!');
    expect(el.querySelector('#tax-unverified-banner')!.textContent).toContain('commercial.tax.unverifiedBanner');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('commercial.tax.demo');
    expect(rows[0].textContent).toContain('commercial.tax.approval.draft');
    expect(rows[0].textContent).toContain('14%');
  });

  it('requires a verification date for a verified rate and adds a rate that then shows up', async () => {
    const { fixture, el } = await render('owner@demo.test', 'Owner-Demo-123!');
    el.querySelector<HTMLButtonElement>('app-page-header button')!.click();
    await settle(fixture);
    const set = (id: string, value: string) => {
      const field = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      field.value = value;
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
    };
    set('tx-code', 'TEST-1');
    set('tx-name', 'Test rate');
    set('tx-rate', '5');
    set('tx-from', '2026-01-01');
    set('tx-source', 'Test decree');
    set('tx-status', 'professionally_verified');
    el.querySelector<HTMLButtonElement>('app-modal button[type="submit"]')!.click();
    await settle(fixture);
    expect(el.querySelector('app-modal .invalid-feedback')).toBeTruthy();
    set('tx-verified', '2026-10-01');
    el.querySelector<HTMLButtonElement>('app-modal button[type="submit"]')!.click();
    await settle(fixture);
    expect(el.querySelector('app-modal')).toBeNull();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(el.textContent).toContain('TEST-1');
  });

  it('shows no create or edit controls to a user without tax.rates.manage', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelectorAll('button')).toHaveLength(0);
  });
});
