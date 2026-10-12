import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../../core/i18n/language.service';
import { activateLedger, clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { AccountsPage } from './accounts-page';

async function render(email: string, password: string) {
  TestBed.configureTestingModule({ imports: [AccountsPage], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs(email, password);
  await activateLedger('le-c-001');
  const fixture = TestBed.createComponent(AccountsPage);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('AccountsPage', () => {
  it('shows the tree with indentation by depth, then the flat list with search', async () => {
    const { fixture, el } = await render('chief@demo.test', 'Chief-Demo-123!');
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows.length).toBeGreaterThan(38);
    const code = (r: Element) => r.querySelector('td')!.textContent!.trim();
    expect(code(rows[0])).toBe('1000');
    expect(code(rows[1])).toBe('1100');
    expect(rows[1].querySelector<HTMLElement>('.indent')!.style.getPropertyValue('--depth')).toBe('1');
    expect(rows[2].querySelector<HTMLElement>('.indent')!.style.getPropertyValue('--depth')).toBe('2');

    el.querySelector<HTMLInputElement>('#acc-view-list')!.click();
    await settle(fixture);
    const search = el.querySelector<HTMLInputElement>('#acc-search')!;
    search.value = '5200';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('labels group versus postable accounts and the active state with text', async () => {
    const { el } = await render('chief@demo.test', 'Chief-Demo-123!');
    expect(el.textContent).toContain('accounting.accounts.group');
    expect(el.textContent).toContain('accounting.accounts.postable');
    expect(el.textContent).toContain('accounting.accounts.active');
    expect(el.textContent).toContain('accounting.accounts.hasPostings');
  });

  it('offers account management only with ledger.manage_accounts', async () => {
    const chief = await render('chief@demo.test', 'Chief-Demo-123!');
    expect(chief.el.textContent).toContain('accounting.accounts.importTemplate');
    expect(chief.el.textContent).toContain('accounting.accounts.new');
    TestBed.resetTestingModule();
    const accountant = await render('accountant@demo.test', 'Accountant-Demo-123!');
    expect(accountant.el.textContent).not.toContain('accounting.accounts.importTemplate');
    expect(accountant.el.textContent).not.toContain('accounting.accounts.new');
    expect(accountant.el.querySelectorAll('tbody tr').length).toBeGreaterThan(38);
  });

  it('creates an account through the form and shows it in the tree', async () => {
    const { fixture, el } = await render('chief@demo.test', 'Chief-Demo-123!');
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent!.includes('accounting.accounts.new'))!.click();
    await settle(fixture);
    const set = async (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    await set('acc-code', '5950');
    await set('acc-name-ar', 'مصروف تجريبي');
    await set('acc-name-en', 'DEMO test expense');
    const category = el.querySelector<HTMLSelectElement>('#acc-category')!;
    category.value = 'expense';
    category.dispatchEvent(new Event('change'));
    await settle(fixture);
    el.querySelector<HTMLFormElement>('app-account-form form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('app-account-form')).toBeNull();
    expect(el.textContent).toContain('5950');
  });
});
