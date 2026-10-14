import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { LanguageService } from '../../core/i18n/language.service';
import { PortalAppointments } from '../portal/portal-appointments';
import { PortalDocuments } from '../portal/portal-documents';
import { PortalHome } from '../portal/portal-home';
import { PortalInvoices } from '../portal/portal-invoices';
import { PortalTickets } from '../portal/portal-tickets';
import { clientTestProviders, settle, signInAs } from '../../testing/test-utils';
import { AppointmentsPage } from './appointments-page';
import { EngageApiService } from './engage-api.service';
import { ForecastPage } from './forecast-page';
import { NotificationBell } from './notification-bell';
import { TicketsPage } from './tickets-page';
import { TimesheetsPage } from './timesheets-page';

const CLIENT = ['client@demo.test', 'Client-Demo-123!'] as const;
const CLIENT2 = ['client2@demo.test', 'Client2-Demo-123!'] as const;
const ACCOUNTANT = ['accountant@demo.test', 'Accountant-Demo-123!'] as const;
const OWNER = ['owner@demo.test', 'Owner-Demo-123!'] as const;
const CHIEF = ['chief@demo.test', 'Chief-Demo-123!'] as const;

async function render<T>(component: new () => T, login: readonly [string, string], params: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [...clientTestProviders(), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params) } } }],
  });
  TestBed.inject(LanguageService).use('en');
  await signInAs(...login);
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const set = (el: HTMLElement, id: string, value: string) => {
  const field = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)!;
  field.value = value;
  field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
};
const click = (el: Element, selector: string, text?: string) => {
  const btn = [...el.querySelectorAll<HTMLElement>(selector)].find((b) => !text || b.textContent!.includes(text))!;
  btn.click();
};

describe('Client portal', () => {
  it('shows a client their own overview', async () => {
    const { el } = await render(PortalHome, CLIENT);
    expect(el.textContent).toContain('DEMO Nile Trading Co.');
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);
  });

  it('lists only issued invoices and never a draft', async () => {
    const { el } = await render(PortalInvoices, CLIENT);
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.length).toBeGreaterThan(0);
    expect(el.textContent).not.toContain('commercial.status.draft');
  });

  it('lists what the office asked for and the documents on file', async () => {
    const { el } = await render(PortalDocuments, CLIENT);
    expect(el.querySelectorAll('ul.list-group li').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('table tbody tr').length).toBeGreaterThan(0);
  });

  it('opens a ticket from the list, shows no internal notes, and lets the client reply and then write a new one', async () => {
    const { fixture, el } = await render(PortalTickets, CLIENT);
    expect(el.querySelectorAll('.list-group-item')).toHaveLength(1);
    click(el, '.list-group-item');
    await settle(fixture);
    expect(el.textContent).toContain('When will the September VAT return be ready?');
    expect(el.textContent).not.toContain('Internal:');
    set(el, 'reply-body', 'Thank you!');
    click(el, 'app-ticket-thread button[type="submit"]');
    await settle(fixture);
    expect(el.textContent).toContain('Thank you!');

    click(el, 'button', 'portal.tickets.new');
    await settle(fixture);
    click(el, 'app-modal button[type="submit"]');
    await settle(fixture);
    expect(el.querySelector('app-modal .invalid-feedback')).toBeTruthy();
    set(el, 'nt-subject', 'Question about payroll');
    set(el, 'nt-body', 'Can you add one more employee?');
    click(el, 'app-modal button[type="submit"]');
    await settle(fixture);
    expect(el.querySelector('app-modal')).toBeNull();
    expect(el.querySelectorAll('.list-group-item').length).toBe(2);
  });

  it('keeps another client\'s ticket out of sight', async () => {
    const { el } = await render(PortalTickets, CLIENT2, { id: 'tk-001' });
    expect(el.textContent).not.toContain('VAT return');
    expect(el.querySelector('.alert-danger')).toBeTruthy();
    expect(el.textContent).toContain('Question about the monthly fee');
  });

  it('requests a meeting, rejecting a date that is not in the future', async () => {
    const { fixture, el } = await render(PortalAppointments, CLIENT);
    click(el, 'button', 'portal.appointments.request');
    await settle(fixture);
    set(el, 'rq-topic', 'Year-end planning');
    set(el, 'rq-when', '2026-01-05T10:00');
    click(el, 'app-modal button[type="submit"]');
    await settle(fixture);
    expect(el.querySelector('app-modal .invalid-feedback')).toBeTruthy();
    set(el, 'rq-when', '2026-11-05T10:00');
    click(el, 'app-modal button[type="submit"]');
    await settle(fixture);
    expect(el.querySelector('app-modal')).toBeNull();
    expect(el.textContent).toContain('Year-end planning');
  });

  it('shows the unread count on the bell, opens the list and clears it', async () => {
    TestBed.configureTestingModule({ imports: [NotificationBell], providers: clientTestProviders() });
    TestBed.inject(LanguageService).use('en');
    // The accountant answers the client's ticket, which notifies the client.
    await signInAs(...ACCOUNTANT);
    await firstValueFrom(TestBed.inject(EngageApiService).reply('staff', 'tk-001', 'Ready now.'));
    await signInAs(...CLIENT);
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.componentRef.setInput('side', 'portal');
    fixture.detectChanges();
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge')!.textContent).toContain('1');
    click(el, 'button[aria-haspopup]');
    await settle(fixture);
    expect(el.querySelectorAll('.list-group-item')).toHaveLength(1);
    click(el, 'button', 'notifications.markAll');
    await settle(fixture);
    expect(el.querySelector('.badge')).toBeNull();
  });
});

describe('Staff desks', () => {
  it('answers a ticket and shows the internal note only to staff', async () => {
    const { fixture, el } = await render(TicketsPage, ACCOUNTANT, { id: 'tk-001' });
    expect(el.textContent).toContain('Internal:');
    expect(el.querySelectorAll('.list-group-item').length).toBe(2);
    set(el, 'reply-body', 'Sent today.');
    click(el, 'app-ticket-thread button[type="submit"]');
    await settle(fixture);
    expect(el.textContent).toContain('Sent today.');
  });

  it('confirms an appointment request', async () => {
    const { fixture, el } = await render(AppointmentsPage, ACCOUNTANT);
    const row = [...el.querySelectorAll('tbody tr')].find((r) => r.textContent!.includes('Onboarding call'))!;
    row.querySelector<HTMLButtonElement>('.btn-success')!.click();
    await settle(fixture);
    click(el, 'app-modal button[type="submit"]');
    await settle(fixture);
    expect(el.querySelector('app-modal')).toBeNull();
    expect([...el.querySelectorAll('tbody tr')].find((r) => r.textContent!.includes('Onboarding call'))!.textContent).toContain('appointments.statuses.confirmed');
  });

  it('logs time, totals the week and submits it', async () => {
    const { fixture, el } = await render(TimesheetsPage, ACCOUNTANT);
    click(el, 'app-page-header button');
    await settle(fixture);
    set(el, 'te-min', '90');
    set(el, 'te-client', 'c-001');
    set(el, 'te-note', 'Monthly close');
    click(el, 'app-modal button[type="submit"]');
    await settle(fixture);
    expect(el.querySelector('app-modal')).toBeNull();
    expect(el.textContent).toContain('Monthly close');
    expect(el.textContent).toContain('1:30');
    click(el, 'button', 'timesheets.submit');
    await settle(fixture);
    expect(el.textContent).toContain('timesheets.statuses.submitted');
  });

  it('shows approvers the weeks waiting, and nobody else', async () => {
    const chief = await render(TimesheetsPage, CHIEF);
    expect(chief.el.textContent).toContain('timesheets.approvals');
    expect([...chief.el.querySelectorAll('tbody tr')].some((r) => r.textContent!.includes('Demo Tax Specialist'))).toBe(true);
    TestBed.resetTestingModule();
    const acc = await render(TimesheetsPage, ACCOUNTANT);
    expect(acc.el.textContent).not.toContain('timesheets.approvals');
  });

  it('builds a thirteen-week forecast for the owner', async () => {
    const { el } = await render(ForecastPage, OWNER);
    expect(el.querySelectorAll('table.table tbody tr')).toHaveLength(13);
    expect(el.querySelectorAll('app-kpi-card')).toHaveLength(4);
  });
});
