import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { GeneralLedgerPage } from './general-ledger';
import { JournalRegisterPage } from './journal-register';
import { TrialBalancePage } from './trial-balance';

async function render<T>(component: new () => T, ledger = 'le-firm') {
  TestBed.configureTestingModule({ imports: [component], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs('chief@demo.test', 'Chief-Demo-123!');
  await activateLedger(ledger);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Trial balance page', () => {
  it('labels the numbers Posted only, shows a totals row and a text reconciliation badge', async () => {
    const { el } = await render(TrialBalancePage);
    expect(el.textContent).toContain('accounting.reports.postedOnly');
    expect(el.textContent).not.toContain('accounting.reports.draftIncluded');
    expect(el.querySelector('#tb-reconciliation')!.textContent).toContain('accounting.reports.reconciled');
    expect(el.querySelector('#tb-reconciliation')!.textContent).not.toContain('notReconciled');
    expect(el.querySelector('#tb-total-debit')!.textContent).toBe(el.querySelector('#tb-total-credit')!.textContent);
    expect(el.querySelector('#tb-total-debit')!.textContent).toBe('1,072,354.47');
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(5);
  });

  it('marks a preview as DRAFT-INCLUDED when unposted entries are included', async () => {
    const { fixture, el } = await render(TrialBalancePage);
    const posted = el.querySelector('#tb-total-debit')!.textContent;
    const box = el.querySelector<HTMLInputElement>('#rep-unposted')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.textContent).toContain('accounting.reports.draftIncluded');
    expect(el.textContent).not.toContain('accounting.reports.postedOnly');
    expect(el.querySelector('#tb-total-debit')!.textContent).not.toBe(posted);
  });

  it('links each account to its general ledger', async () => {
    const { el } = await render(TrialBalancePage);
    const link = el.querySelector<HTMLAnchorElement>('tbody a')!;
    expect(link.getAttribute('href')).toContain('/app/accounting/reports/general-ledger');
    expect(link.getAttribute('href')).toContain('accountId=a-firm-');
  });
});

describe('General ledger and register pages', () => {
  it('shows running balances and drills down to the source journal', async () => {
    const { el } = await render(GeneralLedgerPage);
    expect(el.textContent).toContain('accounting.reports.postedOnly');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(2);
    expect(el.querySelector<HTMLAnchorElement>('tbody a')!.getAttribute('href')).toMatch(/\/app\/accounting\/journals\/je-/);
    expect(el.querySelector('#gl-closing')!.textContent).toContain('accounting.reports.debitShort');
  });

  it('lists the posted entries of the register with a total', async () => {
    const { el } = await render(JournalRegisterPage, 'le-c-009');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(el.textContent).toContain('accounting.reports.postedOnly');
    expect(el.querySelector('tfoot')!.textContent).toContain('accounting.reports.totals');
  });
});
