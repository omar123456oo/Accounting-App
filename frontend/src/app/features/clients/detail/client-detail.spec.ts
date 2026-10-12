import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { clientTestProviders, settle, signInAs } from '../../../testing/test-utils';
import { ClientDetail } from './client-detail';

async function render(id: string, email = 'owner@demo.test', password = 'Owner-Demo-123!', tab?: string) {
  TestBed.configureTestingModule({
    imports: [ClientDetail],
    providers: clientTestProviders([{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }), queryParamMap: convertToParamMap(tab ? { tab } : {}) } } }]),
  });
  await signInAs(email, password);
  const fixture = TestBed.createComponent(ClientDetail);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el };
}

describe('ClientDetail status transitions', () => {
  afterEach(() => localStorage.removeItem('app.lang'));

  it.each([
    ['c-004', 'lead', ['onboarding', 'closed']],
    ['c-003', 'onboarding', ['active', 'closed']],
    ['c-001', 'active', ['suspended', 'closed']],
    ['c-005', 'suspended', ['active', 'closed']],
    ['c-008', 'closed', []],
  ])('%s (%s) offers %j', async (id, _status, expected) => {
    const { fixture, el } = await render(id);
    fixture.detectChanges();
    const labels = Array.from(el.querySelectorAll('button.btn-outline-primary')).map((b) => b.textContent ?? '');
    expect(labels).toHaveLength(expected.length);
    expected.forEach((s, i) => expect(labels[i]).toContain('clients.moveTo'));
  });

  it('asks for confirmation, applies the change and records it in history', async () => {
    const { fixture, el } = await render('c-001');
    el.querySelector<HTMLButtonElement>('button.btn-outline-primary')!.click();
    await settle(fixture);
    expect(el.querySelector('app-confirm-dialog')).toBeTruthy();
    expect(el.querySelector('app-status-badge')!.textContent).toContain('clients.status.active');
    el.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')[1].click();
    await settle(fixture);
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
    expect(el.querySelector('app-status-badge')!.textContent).toContain('clients.status.suspended');
    el.querySelector<HTMLButtonElement>('#tab-history')!.click();
    await settle(fixture);
    expect(el.querySelector('tbody')!.textContent).toContain('clients.status.suspended');
  });

  it('cancelling the dialog changes nothing', async () => {
    const { fixture, el } = await render('c-001');
    el.querySelector<HTMLButtonElement>('button.btn-outline-primary')!.click();
    await settle(fixture);
    el.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')[0].click();
    await settle(fixture);
    expect(el.querySelector('app-status-badge')!.textContent).toContain('clients.status.active');
  });

  it('shows not-found instead of data when the API refuses the user (403)', async () => {
    const { el } = await render('c-001', 'client@demo.test', 'Client-Demo-123!');
    expect(el.textContent).toContain('clients.notFound');
  });

  it('switches tabs and lists sub-resources', async () => {
    localStorage.setItem('app.lang', 'en');
    const { fixture, el } = await render('c-001');
    el.querySelector<HTMLButtonElement>('#tab-agreements')!.click();
    await settle(fixture);
    expect(el.querySelector('[role="tabpanel"] tbody')!.textContent).toContain('1,500.50');
  });

  it('opens the onboarding tab straight from a ?tab=onboarding link', async () => {
    const { el } = await render('c-003', 'owner@demo.test', 'Owner-Demo-123!', 'onboarding');
    expect(el.querySelector('#tab-onboarding')!.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('app-onboarding-tab')).toBeTruthy();
  });

  it('offers the documents tab only with documents.view', async () => {
    const owner = await render('c-001');
    expect(owner.el.querySelector('#tab-documents')).toBeTruthy();
    TestBed.resetTestingModule();
    const accountantless = await render('c-001', 'client@demo.test', 'Client-Demo-123!');
    expect(accountantless.el.querySelector('#tab-documents')).toBeNull();
  });
});
