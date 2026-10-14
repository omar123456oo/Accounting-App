import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { EmployeeDetail } from './employee-detail';
import { EmployeeList } from './employee-list';
import { LeavePage } from './leave-page';
import { PayrollPage } from './payroll-page';

const OWNER = ['owner@demo.test', 'Owner-Demo-123!'] as const;
const ACCOUNTANT = ['accountant@demo.test', 'Accountant-Demo-123!'] as const;

async function render<T>(component: new () => T, login: readonly [string, string], routeId?: string) {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [...clientTestProviders(), ...(routeId ? [{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: routeId }) } } }] : [])],
  });
  TestBed.inject(LanguageService).use('en');
  await signInAs(...login);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const set = (el: HTMLElement, id: string, value: string) => {
  const field = el.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
  field.value = value;
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
};

describe('HR pages', () => {
  it('lists every employee for the owner and filters by search', async () => {
    const { fixture, el } = await render(EmployeeList, OWNER);
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(7);
    set(el, 'emp-q', 'tax');
    await settle(fixture);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Demo Tax Specialist');
    expect(el.textContent).not.toMatch(/\d{2},\d{3}/); // salaries never appear in the list
  });

  it('shows an accountant only their own leave, with no approve buttons, and files a request', async () => {
    const { fixture, el } = await render(LeavePage, ACCOUNTANT);
    expect(el.querySelectorAll('app-leave-balances .card')).toHaveLength(4);
    expect(el.querySelectorAll('app-leave-table tbody tr')).toHaveLength(2);
    expect(el.textContent).not.toContain('hr.leave.approve');
    expect(el.querySelector('.nav-tabs')).toBeNull();

    el.querySelector<HTMLButtonElement>('app-page-header button')!.click();
    await settle(fixture);
    set(el, 'lv-type', 'lt-annual');
    set(el, 'lv-from', '2026-11-22');
    set(el, 'lv-to', '2026-11-23');
    el.querySelector<HTMLButtonElement>('app-modal button[type="submit"]')!.click();
    await settle(fixture);
    expect(el.querySelector('app-modal')).toBeNull();
    expect(el.querySelectorAll('app-leave-table tbody tr')).toHaveLength(3);
  });

  it('tells a person with no HR file why the request cannot be filed instead of staying silent', async () => {
    const { fixture, el } = await render(LeavePage, ACCOUNTANT);
    el.querySelector<HTMLButtonElement>('app-page-header button')!.click();
    await settle(fixture);
    set(el, 'lv-type', 'lt-annual');
    set(el, 'lv-from', '2026-11-22');
    set(el, 'lv-to', '2026-11-23');
    // The server refuses with an error for a field the form does not have (userId), as it does for someone without an HR file.
    const dialog = el.querySelector('app-leave-apply-dialog') as HTMLElement;
    const { HrApiService } = await import('./hr-api.service');
    const { throwError } = await import('rxjs');
    const { HttpErrorResponse } = await import('@angular/common/http');
    vi.spyOn(TestBed.inject(HrApiService), 'apply').mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { userId: ['Not an employee.'] } } })));
    el.querySelector<HTMLButtonElement>('app-modal button[type="submit"]')!.click();
    await settle(fixture);
    expect(dialog.querySelector('.alert-danger')!.textContent).toContain('Not an employee.');
    expect(el.querySelector('app-modal')).not.toBeNull();
  });

  it('lets the owner see everyone\'s requests and approve a pending one', async () => {
    const { fixture, el } = await render(LeavePage, OWNER);
    [...el.querySelectorAll<HTMLButtonElement>('.nav-tabs .nav-link')][1].click();
    await settle(fixture);
    const rows = [...el.querySelectorAll('app-leave-table tbody tr')];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const pending = rows.find((r) => r.textContent!.includes('Demo Accountant') && r.textContent!.includes('hr.leave.status.pending'))!;
    pending.querySelector<HTMLButtonElement>('.btn-success')!.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('app-comment-dialog .btn-primary')!.click();
    await settle(fixture);
    // The status filter lists every status too, so look at the table only.
    expect(el.querySelector('app-leave-table')!.textContent).not.toContain('hr.leave.status.pending');
  });

  it('generates a payroll draft with the unpaid-leave deduction, then finalises it', async () => {
    const { fixture, el } = await render(PayrollPage, OWNER);
    set(el, 'pay-month', '2026-10');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('hr.payroll.generate'))!.click();
    await settle(fixture);
    const row = [...el.querySelectorAll('tbody tr')].find((r) => r.textContent!.includes('Demo Accountant'))!;
    expect(row.textContent).toContain('hr.payroll.unpaidLeave');
    expect(row.textContent).toContain('14,250');
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('hr.payroll.finalize'))!.click();
    await settle(fixture);
    el.querySelector<HTMLButtonElement>('app-confirm-dialog .btn-primary')!.click();
    await settle(fixture);
    expect(el.textContent).toContain('hr.payroll.status.final');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent!.includes('hr.payroll.finalize'))).toBe(false);
  });

  it('opens an accountant\'s own file read-only, with salary and payslip tabs but no edit', async () => {
    const { fixture, el } = await render(EmployeeDetail, ACCOUNTANT, 'u-accountant');
    expect(el.querySelector('h1')!.textContent).toContain('Demo Accountant');
    expect(el.querySelectorAll('.nav-tabs .nav-link')).toHaveLength(4);
    expect(el.querySelector<HTMLInputElement>('#emp-title')!.disabled).toBe(true);
    expect(el.querySelector('button[type="submit"]')).toBeNull();
    [...el.querySelectorAll<HTMLButtonElement>('.nav-tabs .nav-link')][1].click();
    await settle(fixture);
    expect(el.textContent).toContain('15,000');
    expect(el.textContent).not.toContain('common.edit');
  });

  it('refuses another person\'s file to an accountant', async () => {
    const { el } = await render(EmployeeDetail, ACCOUNTANT, 'u-owner');
    expect(el.querySelector('.alert-danger')!.textContent).toContain('hr.employees.loadFailed');
  });

  it('lets the owner edit a profile and the salary', async () => {
    const { fixture, el } = await render(EmployeeDetail, OWNER, 'u-tax');
    set(el, 'emp-title', 'Head of tax');
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settle(fixture);
    expect(el.querySelector('.alert-success')).toBeTruthy();

    [...el.querySelectorAll<HTMLButtonElement>('.nav-tabs .nav-link')][1].click();
    await settle(fixture);
    [...el.querySelectorAll<HTMLButtonElement>('app-salary-panel button')].find((b) => b.textContent!.includes('common.edit'))!.click();
    await settle(fixture);
    set(el, 'sal-base', '21000.00');
    el.querySelector<HTMLButtonElement>('app-salary-panel button[type="submit"]')!.click();
    await settle(fixture);
    expect(el.textContent).toContain('21,000');
  });
});
