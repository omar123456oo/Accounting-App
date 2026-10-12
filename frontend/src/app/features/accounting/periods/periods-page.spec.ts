import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { PeriodsPage } from './periods-page';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [PeriodsPage], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs(email, password);
  await activateLedger('le-c-001');
  const fixture = TestBed.createComponent(PeriodsPage);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PeriodsPage', () => {
  it('lists twelve periods with the status as text and the locked January', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(12);
    expect(rows[0].textContent).toContain('accounting.periods.status.locked');
    expect(rows[9].textContent).toContain('accounting.periods.status.open');
  });

  it('requires a reason to reopen, and records it', async () => {
    const { fixture, el } = await render('chief@demo.test', 'Chief-Demo-123!');
    const reopen = Array.from(el.querySelectorAll<HTMLButtonElement>('tbody tr:first-child button')).find((b) => b.textContent!.includes('accounting.periods.reopen'))!;
    reopen.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('app-comment-dialog .btn-danger')!.click();
    await settle(fixture);
    expect(el.querySelector('app-comment-dialog [role="alert"]')).toBeTruthy();
    const reason = el.querySelector<HTMLTextAreaElement>('app-comment-dialog textarea')!;
    reason.value = 'Late supplier invoice';
    reason.dispatchEvent(new Event('input'));
    el.querySelector<HTMLButtonElement>('app-comment-dialog .btn-danger')!.click();
    await settle(fixture);
    const first = el.querySelector('tbody tr')!;
    expect(first.textContent).toContain('accounting.periods.status.open');
    expect(first.textContent).toContain('Late supplier invoice');
  });

  it('hides period controls from an accountant', async () => {
    const { el } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
    expect(el.textContent).not.toContain('accounting.periods.newYear');
  });
});
