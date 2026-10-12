import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/i18n/language.service';
import { clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { CommercialSummaryWidget } from './commercial-summary';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [CommercialSummaryWidget], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs(email, password);
  const fixture = TestBed.createComponent(CommercialSummaryWidget);
  fixture.detectChanges();
  await settle(fixture);
  return { el: fixture.nativeElement as HTMLElement };
}

describe('Commercial dashboard widget', () => {
  it('shows real counts and per-ledger receivables for a chief who sees every ledger', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!');
    expect(el.querySelector('#work-overdueInvoices')!.textContent).toBe('4');
    expect(el.querySelector('#work-billsDue')!.textContent).toBe('1');
    expect(el.querySelector('#receivables-le-firm')!.textContent).toBe('62,479.99');
    expect(el.querySelector('#receivables-le-c-001')!.textContent).toBe('54,000.00');
    expect(el.querySelectorAll('#commercial-per-ledger tbody tr')).toHaveLength(3);
  });

  it('limits an accountant to the assigned client ledger and shows the overdue count of that ledger only', async () => {
    const { el } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    expect(el.querySelectorAll('#commercial-per-ledger tbody tr')).toHaveLength(1);
    expect(el.querySelector('#work-overdueInvoices')!.textContent).toBe('1');
  });
});
