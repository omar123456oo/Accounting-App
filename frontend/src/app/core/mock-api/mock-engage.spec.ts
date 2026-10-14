import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { mockHttpProviders, signInDemo } from '../../testing/test-utils';

const STAFF = '/api/v1/staff';
const PORTAL = '/api/v1/portal';

interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

describe('mock engagement API (portal, tickets, appointments, notifications, time sheets)', () => {
  let http: HttpClient;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: mockHttpProviders() });
    http = TestBed.inject(HttpClient);
  });

  async function call(method: string, url: string, body?: unknown): Promise<Res> {
    try {
      const res = await firstValueFrom(http.request(method, url, { body, observe: 'response' }));
      return { status: res.status, body: res.body };
    } catch (e) {
      const err = e as HttpErrorResponse;
      return { status: err.status, body: err.error };
    }
  }
  const staff = (m: string, p: string, b?: unknown) => call(m, `${STAFF}/${p}`, b);
  const portal = (m: string, p: string, b?: unknown) => call(m, `${PORTAL}/${p}`, b);

  describe('portal isolation', () => {
    it('shows a client only their own tickets and treats another client\'s as missing', async () => {
      await signInDemo('client@demo.test');
      const list = (await portal('GET', 'tickets')).body.data as { id: string }[];
      expect(list.map((t) => t.id)).toEqual(['tk-001']);
      expect((await portal('GET', 'tickets/tk-002')).status).toBe(404);
      expect((await portal('POST', 'tickets/tk-002/messages', { body: 'hi' })).status).toBe(404);
      await signInDemo('client2@demo.test');
      expect(((await portal('GET', 'tickets')).body.data as { id: string }[]).map((t) => t.id)).toEqual(['tk-002']);
      expect((await portal('GET', 'tickets/tk-001')).status).toBe(404);
    });

    it('never sends internal staff notes to the portal', async () => {
      await signInDemo('client@demo.test');
      const t = (await portal('GET', 'tickets/tk-001')).body.data;
      expect(t.messages.every((m: { internal: boolean }) => !m.internal)).toBe(true);
      expect(JSON.stringify(t)).not.toContain('Internal:');
      await signInDemo('accountant@demo.test');
      expect(JSON.stringify((await staff('GET', 'tickets/tk-001')).body.data)).toContain('Internal:');
    });

    it('keeps portal users out of the staff API and staff out of the portal', async () => {
      await signInDemo('client@demo.test');
      expect((await staff('GET', 'tickets')).status).toBe(403);
      expect((await staff('GET', 'clients')).status).toBe(403);
      expect((await staff('GET', 'hr/employees')).status).toBe(403);
      await signInDemo('accountant@demo.test');
      expect((await portal('GET', 'overview')).status).toBe(403);
    });

    it('lists only issued invoices of the client\'s own books, and only the safe fields', async () => {
      await signInDemo('client@demo.test');
      const invoices = (await portal('GET', 'invoices')).body.data as Record<string, unknown>[];
      expect(invoices.length).toBeGreaterThan(0);
      expect(invoices.every((i) => !['draft', 'pending_approval', 'cancelled'].includes(i['status'] as string))).toBe(true);
      expect(Object.keys(invoices[0]).sort()).toEqual(['balance', 'date', 'dueDate', 'id', 'reference', 'status', 'total']);
      await signInDemo('client2@demo.test');
      const other = (await portal('GET', 'invoices')).body.data as unknown[];
      expect(JSON.stringify(other)).not.toBe(JSON.stringify(invoices));
    });

    it('gives each client their own documents and overview', async () => {
      await signInDemo('client@demo.test');
      const docs = (await portal('GET', 'documents')).body.data as { name: string }[];
      expect(docs.length).toBeGreaterThan(0);
      expect(Object.keys(docs[0]).sort()).toEqual(['category', 'id', 'name', 'reviewStatus', 'year']);
      const overview = (await portal('GET', 'overview')).body.data;
      expect(overview.clientName).toBe('DEMO Nile Trading Co.');
      expect(overview.openTickets).toBe(1);
    });
  });

  describe('tickets', () => {
    it('lets a client open a ticket, notifies the assigned accountant, and shows the reply back to the client', async () => {
      await signInDemo('client@demo.test');
      const created = await portal('POST', 'tickets', { subject: 'Missing receipt', category: 'documents', body: 'Where is my receipt?' });
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      await signInDemo('accountant@demo.test');
      const feed = (await staff('GET', 'notifications')).body;
      expect(feed.meta.unread).toBeGreaterThan(0);
      expect(feed.data[0].kind).toBe('ticket.new');
      expect((await staff('POST', `tickets/${id}/messages`, { body: 'Sent by e-mail today.' })).status).toBe(201);
      expect((await staff('GET', `tickets/${id}`)).body.data.status).toBe('answered');
      await signInDemo('client@demo.test');
      expect((await portal('GET', 'notifications')).body.data[0].kind).toBe('ticket.reply');
    });

    it('validates new tickets and refuses replies once closed', async () => {
      await signInDemo('client@demo.test');
      expect((await portal('POST', 'tickets', { subject: '', category: 'tax', body: '' })).status).toBe(422);
      expect((await portal('POST', 'tickets', { subject: 'x', category: 'nonsense', body: 'y' })).status).toBe(422);
      expect((await portal('POST', 'tickets/tk-001/close', {})).body.data.status).toBe('closed');
      expect((await portal('POST', 'tickets/tk-001/messages', { body: 'hello?' })).status).toBe(409);
    });

    it('keeps tickets of clients a staff member cannot see out of their inbox', async () => {
      await signInDemo('auditor@demo.test'); // office-wide but no ticket desk
      expect((await staff('GET', 'tickets')).status).toBe(403);
      await signInDemo('accountant@demo.test');
      const ids = ((await staff('GET', 'tickets')).body.data as { id: string }[]).map((t) => t.id);
      expect(ids).toEqual(expect.arrayContaining(['tk-001', 'tk-002']));
    });

    it('allows staff to assign and close, and to write an internal note that does not change the status', async () => {
      await signInDemo('accountant@demo.test');
      expect((await staff('POST', 'tickets/tk-002/assign', { assigneeId: 'u-accountant' })).body.data.assigneeName).toBe('Demo Accountant');
      expect((await staff('POST', 'tickets/tk-002/assign', { assigneeId: 'u-client' })).status).toBe(422);
      const note = await staff('POST', 'tickets/tk-002/messages', { body: 'Check the agreement first.', internal: true });
      expect(note.body.data.status).toBe('open');
      expect((await staff('POST', 'tickets/tk-002/status', { status: 'closed' })).body.data.status).toBe('closed');
    });
  });

  describe('appointments', () => {
    const request = (extra: object = {}) => portal('POST', 'appointments', { topic: 'Review', startsAt: '2026-11-03T10:00', durationMin: 60, ...extra });

    it('accepts a future request and rejects past dates and odd durations', async () => {
      await signInDemo('client@demo.test');
      expect((await request()).status).toBe(201);
      expect((await request({ startsAt: '2026-10-01T10:00' })).status).toBe(422);
      expect((await request({ startsAt: 'tomorrow' })).status).toBe(422);
      expect((await request({ durationMin: 17 })).status).toBe(422);
      expect((await request({ topic: '' })).status).toBe(422);
    });

    it('is confirmed or declined by staff, who must give a reason to decline, and the client is told', async () => {
      await signInDemo('accountant@demo.test');
      expect((await staff('POST', 'appointments/ap-002/decline', {})).status).toBe(422);
      expect((await staff('POST', 'appointments/ap-002/confirm', { startsAt: '2026-10-22T14:00' })).body.data.status).toBe('confirmed');
      expect((await staff('POST', 'appointments/ap-002/decline', { note: 'x' })).status).toBe(409);
      await signInDemo('client2@demo.test');
      expect((await portal('GET', 'notifications')).body.data[0].kind).toBe('appointment.confirmed');
    });

    it('refuses to double-book the same person', async () => {
      await signInDemo('client2@demo.test');
      const id = (await request({ startsAt: '2026-10-20T11:30', durationMin: 30 })).body.data.id as string;
      await signInDemo('accountant@demo.test');
      // ap-001 (confirmed, same staff) runs 11:00-12:00 on 2026-10-20.
      expect((await staff('POST', `appointments/${id}/confirm`, {})).status).toBe(409);
      expect((await staff('POST', `appointments/${id}/confirm`, { startsAt: '2026-10-20T12:00' })).status).toBe(200);
    });

    it('lets a client cancel only their own booking', async () => {
      await signInDemo('client2@demo.test');
      expect((await portal('POST', 'appointments/ap-001/cancel', {})).status).toBe(404);
      expect((await portal('POST', 'appointments/ap-002/cancel', {})).body.data.status).toBe('cancelled');
    });
  });

  describe('notifications', () => {
    it('is per user: others\' notifications cannot be read or cleared', async () => {
      await signInDemo('client@demo.test');
      await portal('POST', 'tickets', { subject: 'n', category: 'other', body: 'n' });
      await signInDemo('accountant@demo.test');
      const feed = (await staff('GET', 'notifications')).body;
      const id = feed.data[0].id as string;
      await signInDemo('owner@demo.test');
      expect((await staff('POST', `notifications/${id}/read`, {})).status).toBe(404);
      await signInDemo('accountant@demo.test');
      expect((await staff('POST', `notifications/${id}/read`, {})).status).toBe(204);
      expect((await staff('POST', 'notifications/read-all', {})).status).toBe(204);
      expect((await staff('GET', 'notifications')).body.meta.unread).toBe(0);
    });

    it('tells an employee when their leave is decided', async () => {
      await signInDemo('owner@demo.test');
      await staff('POST', 'hr/leave/lv-003/approve', { note: 'ok' });
      await signInDemo('accountant@demo.test');
      expect((await staff('GET', 'notifications')).body.data.some((n: { kind: string }) => n.kind === 'leave.approved')).toBe(true);
    });
  });

  describe('time sheets', () => {
    const entry = (extra: object = {}) => staff('POST', 'timesheets/entries', { date: '2026-10-11', minutes: 120, clientId: 'c-001', note: 'Work', billable: true, ...extra });

    it('validates entries: size, future dates, billable needs a client, 24 hours a day, visible clients only', async () => {
      await signInDemo('accountant@demo.test');
      expect((await entry({ minutes: 2 })).status).toBe(422);
      expect((await entry({ minutes: 1500 })).status).toBe(422);
      expect((await entry({ date: '2026-12-01' })).status).toBe(422);
      expect((await entry({ clientId: undefined })).status).toBe(422);
      expect((await entry({ clientId: 'c-099' })).status).toBe(422);
      expect((await entry({ date: '2026-10-05', minutes: 1300 })).body.errors.minutes).toBeDefined(); // te-002 already has 180
    });

    it('lets a person edit and delete their own drafts but not submitted or approved time', async () => {
      await signInDemo('accountant@demo.test');
      const id = (await entry()).body.data.id as string;
      expect((await staff('PUT', `timesheets/entries/${id}`, { date: '2026-10-11', minutes: 90, clientId: 'c-001', note: 'Work', billable: true })).body.data.minutes).toBe(90);
      expect((await staff('PUT', 'timesheets/entries/te-001', { date: '2026-10-04', minutes: 1, note: 'x', billable: false })).status).toBe(409);
      expect((await staff('DELETE', `timesheets/entries/${id}`)).status).toBe(204);
      expect((await staff('DELETE', 'timesheets/entries/te-004')).status).toBe(404);
    });

    it('runs submit, approve and reject with four-eyes', async () => {
      await signInDemo('accountant@demo.test');
      await entry();
      expect((await staff('POST', 'timesheets/submit', { weekStart: '2026-10-11' })).status).toBe(200);
      expect((await staff('POST', 'timesheets/submit', { weekStart: '2026-10-11' })).status).toBe(409);
      expect((await staff('GET', 'timesheets/pending')).status).toBe(403);
      await signInDemo('chief@demo.test');
      const pending = (await staff('GET', 'timesheets/pending')).body.data as { userId: string; weekStart: string; minutes: number }[];
      expect(pending.map((p) => p.userId)).toEqual(expect.arrayContaining(['u-tax', 'u-accountant']));
      const tax = pending.find((p) => p.userId === 'u-tax')!;
      expect(tax.minutes).toBe(540);
      expect((await staff('POST', 'timesheets/decide', { userId: 'u-tax', weekStart: tax.weekStart, action: 'reject' })).status).toBe(422);
      expect((await staff('POST', 'timesheets/decide', { userId: 'u-tax', weekStart: tax.weekStart, action: 'reject', note: 'Split by client' })).status).toBe(200);
      await signInDemo('tax@demo.test');
      expect(((await staff('GET', 'timesheets/entries')).body.data as { status: string }[]).every((e) => e.status === 'rejected')).toBe(true);
      expect((await staff('GET', 'notifications')).body.data[0].kind).toBe('timesheet.rejected');
      expect((await staff('POST', 'timesheets/decide', { userId: 'u-tax', weekStart: '2026-10-04', action: 'approve' })).status).toBe(403);
    });

    it('stops anyone approving their own week', async () => {
      await signInDemo('chief@demo.test');
      await staff('POST', 'timesheets/entries', { date: '2026-10-11', minutes: 60, clientId: 'c-001', note: 'x', billable: true });
      await staff('POST', 'timesheets/submit', { weekStart: '2026-10-11' });
      expect((await staff('POST', 'timesheets/decide', { userId: 'u-chief', weekStart: '2026-10-11', action: 'approve' })).status).toBe(409);
    });

    it('shows ordinary staff only their own entries', async () => {
      await signInDemo('accountant@demo.test');
      expect((await staff('GET', 'timesheets/entries?userId=u-tax')).status).toBe(403);
      const mine = (await staff('GET', 'timesheets/entries')).body.data as { userId: string }[];
      expect(mine.every((e) => e.userId === 'u-accountant')).toBe(true);
    });
  });
});
