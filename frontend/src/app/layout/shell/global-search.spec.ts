import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { GlobalSearch } from './global-search';

async function render(login: readonly [string, string]) {
  TestBed.configureTestingModule({ imports: [GlobalSearch], providers: clientTestProviders() });
  TestBed.inject(LanguageService).use('en');
  await signInAs(...login);
  const fixture = TestBed.createComponent(GlobalSearch);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('#global-search')!;
  const type = async (value: string) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 400));
    await settle(fixture);
  };
  return { fixture, el, input, type };
}

describe('Global search', () => {
  it('finds clients, people and other records the owner may open, grouped by kind', async () => {
    const { el, type } = await render(['owner@demo.test', 'Owner-Demo-123!']);
    await type('demo');
    const heads = [...el.querySelectorAll('[role="listbox"] .text-uppercase')].map((h) => h.textContent!.trim());
    expect(heads).toContain('search.kinds.employee');
    expect(el.querySelectorAll('[role="option"]').length).toBeGreaterThan(1);
  });

  it('opens the highlighted result with the keyboard and clears the box', async () => {
    const { fixture, el, input, type } = await render(['owner@demo.test', 'Owner-Demo-123!']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await type('demo');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle(fixture);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('says so when nothing matches and waits for two characters', async () => {
    const { el, type } = await render(['owner@demo.test', 'Owner-Demo-123!']);
    await type('d');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    await type('zzzzqqqq');
    expect(el.querySelector('[role="listbox"]')!.textContent).toContain('search.none');
  });

  it('never offers a page or record the person has no permission for', async () => {
    const { el, type } = await render(['auditor@demo.test', 'Auditor-Demo-123!']);
    await type('payroll');
    const heads = [...el.querySelectorAll('[role="listbox"] .text-uppercase')].map((h) => h.textContent!.trim());
    expect(heads).not.toContain('search.kinds.page'); // the payroll page needs payroll.view
    expect(heads).not.toContain('search.kinds.employee'); // the HR files need hr.view
    expect(heads).toContain('search.kinds.document'); // documents the auditor may read still appear
  });
});
