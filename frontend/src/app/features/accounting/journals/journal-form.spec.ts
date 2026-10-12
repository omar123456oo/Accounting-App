import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { JournalForm } from './journal-form';

async function render() {
  TestBed.configureTestingModule({ imports: [JournalForm], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs('accountant@demo.test', 'Accountant-Demo-123!');
  await activateLedger('le-c-001');
  const fixture = TestBed.createComponent(JournalForm);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    await settle(fixture);
  };
  const submit = () => el.querySelector<HTMLButtonElement>('button.btn-primary')!;
  return { fixture, el, type, submit };
}

describe('JournalForm', () => {
  it('shows live totals and the difference as text, and keeps submit disabled until balanced', async () => {
    const { fixture, el, type, submit } = await render();
    expect(submit().disabled).toBe(true);
    expect(el.querySelector('#balance-status')!.textContent).toContain('accounting.journals.outOfBalance');

    await type('#je-date', '2026-10-12');
    await type('#je-description', 'DEMO form test');
    await type('#line-account-0', 'a-c-001-5900');
    await type('#line-debit-0', '0.1');
    await type('#line-account-1', 'a-c-001-1110');
    await type('#line-credit-1', '0.3');
    expect(el.querySelector('#total-debit')!.textContent).toContain('0.10');
    expect(el.querySelector('#total-credit')!.textContent).toContain('0.30');
    expect(el.querySelector('#balance-status')!.textContent).toContain('accounting.journals.outOfBalance');
    expect(submit().disabled).toBe(true);

    await type('#line-debit-0', '0.1');
    el.querySelector<HTMLButtonElement>('button.btn-outline-secondary')!.click();
    await settle(fixture);
    await type('#line-account-2', 'a-c-001-5300');
    await type('#line-debit-2', '0.2');
    expect(el.querySelector('#balance-status')!.textContent).toContain('accounting.journals.balanced');
    expect(el.querySelector('#balance-status')!.textContent).not.toContain('outOfBalance');
    expect(submit().disabled).toBe(false);
  });

  it('adds and removes lines, with a two-line minimum, and clears the other side when an amount is typed', async () => {
    const { fixture, el, type } = await render();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    (el.querySelector<HTMLButtonElement>('button.btn-outline-secondary')!).click();
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(3);
    el.querySelectorAll<HTMLButtonElement>('tbody button.btn-outline-danger')[2].click();
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelector<HTMLButtonElement>('tbody button.btn-outline-danger')!.disabled).toBe(true);

    await type('#line-credit-0', '5');
    await type('#line-debit-0', '7');
    expect(el.querySelector<HTMLInputElement>('#line-credit-0')!.value).toBe('');
  });

  it('keeps submit disabled when an amount has more than four decimals', async () => {
    const { el, type, submit } = await render();
    await type('#je-date', '2026-10-12');
    await type('#je-description', 'x');
    await type('#line-account-0', 'a-c-001-5900');
    await type('#line-debit-0', '1.23456');
    await type('#line-account-1', 'a-c-001-1110');
    await type('#line-credit-1', '1.23456');
    expect(submit().disabled).toBe(true);
    expect(el.textContent).toContain('accounting.journals.incompleteLines');
  });
});
