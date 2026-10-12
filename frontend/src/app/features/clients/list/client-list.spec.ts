import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ClientsApiService } from '../clients-api.service';
import { clientTestProviders, settle, signInAs } from '../clients-test-utils';
import { ClientList } from './client-list';

async function render(email = 'owner@demo.test', password = 'Owner-Demo-123!') {
  TestBed.configureTestingModule({ imports: [ClientList], providers: clientTestProviders() });
  await signInAs(email, password);
  const fixture = TestBed.createComponent(ClientList);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement, api: TestBed.inject(ClientsApiService) };
}

describe('ClientList', () => {
  it('renders one page of rows with pagination info and a new-client action', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(el.textContent).toContain('DEMO');
    expect(el.querySelector('a[href="/app/clients/new"]')).toBeTruthy();
    expect(el.querySelector('th[aria-sort="ascending"]')?.textContent).toContain('clients.fields.legalName');
  });

  it('shows the empty state when nothing matches', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector<HTMLInputElement>('#client-q')!;
    input.value = 'no-such-client';
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('tbody')).toBeNull();
    expect(el.textContent).toContain('clients.empty');
  });

  it('requests the server with the chosen status filter, from page 1', async () => {
    const { fixture, el, api } = await render();
    const spy = vi.spyOn(api, 'list');
    const select = el.querySelector<HTMLSelectElement>('#client-status')!;
    select.value = 'active';
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', page: 1 }));
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('sorts by a column and pages with the server', async () => {
    const { fixture, el, api } = await render();
    const spy = vi.spyOn(api, 'list');
    el.querySelector<HTMLButtonElement>('th button')!.click();
    await settle(fixture);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'legalName', dir: 'desc' }));
    el.querySelectorAll<HTMLButtonElement>('nav button')[1].click();
    await settle(fixture);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows an error with a retry button when the request fails', async () => {
    const { fixture, el, api } = await render();
    vi.spyOn(api, 'list').mockReturnValueOnce(throwError(() => new Error('boom')));
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('clients.loadFailed');
    vi.spyOn(api, 'list').mockReturnValue(of({ data: [], meta: { page: 1, pageSize: 10, total: 0 } }));
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await settle(fixture);
    expect(el.textContent).toContain('clients.empty');
  });

  it('lists only assigned clients for an accountant without an office-wide role, and hides create', async () => {
    const { el } = await render('accountant@demo.test', 'Accountant-Demo-123!');
    const rows = Array.from(el.querySelectorAll('tbody tr')).map((r) => r.textContent ?? '');
    expect(rows.length).toBe(4);
    expect(rows.join(' ')).not.toContain('DEMO Pyramid Logistics');
    expect(el.querySelector('a[href="/app/clients/new"]')).toBeNull();
  });
});
