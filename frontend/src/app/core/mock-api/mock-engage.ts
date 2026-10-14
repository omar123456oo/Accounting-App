import { APPOINTMENT_DURATIONS, Appointment, PendingWeek, TICKET_CATEGORIES, TICKET_STATUSES, Ticket, TicketSummary, TimeEntry } from '../../features/engage/engage.models';
import { addDays, mockToday } from './mock-clock';
import { MockClients } from './mock-clients';
import { Rules, validate } from './mock-clients-rules';
import { StoredAppointment, StoredEntry, StoredTicket, seedAppointments, seedEntries, seedTickets } from './mock-engage-data';
import { NotificationHub } from './mock-notifications';
import { MockAudit } from './mock-audit';
import { MockModule, MockRequest, MockResult, clean, fail, invalid, need, ok } from './mock-types';
import { DEMO_USERS, DemoUser } from './mock-users';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nameOf = (id: string): string => DEMO_USERS.find((u) => u.profile.id === id)?.profile.name ?? id;
const has = (u: DemoUser, p: string): boolean => u.profile.permissions.includes(p);
const DATETIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** The Sunday that starts the week of a business date (Egypt's working week runs Sunday to Thursday). */
export function weekStartOf(date: string): string {
  return addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
}

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Client conversations, appointments, notifications and time sheets. Staff reach it under /api/v1/staff, portal users
 * under /api/v1/portal; both go through the same rules here, and a portal user only ever touches their own client's rows.
 */
export class MockEngage implements MockModule {
  private readonly tickets: StoredTicket[] = seedTickets();
  private readonly appointments: StoredAppointment[] = seedAppointments();
  private readonly entries: StoredEntry[] = seedEntries();
  private seq = 100;

  constructor(
    private readonly clients: MockClients,
    readonly hub: NotificationHub,
    private readonly audit: MockAudit,
  ) {}

  // ---- staff entry point ----------------------------------------------------------------------------------------

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [area, a, b] = req.path.split('/');
    switch (area) {
      case 'tickets':
        return this.staffTickets(req, user, a, b);
      case 'appointments':
        return this.staffAppointments(req, user, a, b);
      case 'notifications':
        return this.notifications(req, user, a, b);
      case 'timesheets':
        return this.timesheets(req, user, a, b);
      default:
        return fail(404, 'notFound');
    }
  }

  // ---- shared helpers -------------------------------------------------------------------------------------------

  private summary(t: StoredTicket): TicketSummary {
    const { messages, ...rest } = t;
    const visible = messages.filter((m) => !m.internal);
    return clean({ ...rest, clientName: this.clients.clientName(t.clientId), ...(t.assigneeId ? { assigneeName: nameOf(t.assigneeId) } : {}), messageCount: visible.length, lastSide: (visible[visible.length - 1] ?? messages[messages.length - 1]).side });
  }

  /** Staff see internal notes; the portal never does. */
  private full(t: StoredTicket, forStaff: boolean): Ticket {
    return structuredClone({ ...this.summary(t), messages: t.messages.filter((m) => forStaff || !m.internal) });
  }

  private appointmentDto(a: StoredAppointment): Appointment {
    return clean({ ...a, clientName: this.clients.clientName(a.clientId), ...(a.staffId ? { staffName: nameOf(a.staffId) } : {}) });
  }

  /** Staff who should hear about a client's activity: its accountants, or every ticket-desk user when nobody is assigned. */
  private recipientsFor(clientId: string): string[] {
    const assigned = this.clients.accountantsOf(clientId);
    if (assigned.length) return assigned;
    return DEMO_USERS.filter((u) => u.profile.type === 'staff' && has(u, 'tickets.manage') && u.officeWide).map((u) => u.profile.id);
  }

  private clientUsers(clientId: string): string[] {
    return DEMO_USERS.filter((u) => u.clientId === clientId).map((u) => u.profile.id);
  }

  private newId(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }

  // ---- tickets: staff -------------------------------------------------------------------------------------------

  private staffTickets(req: MockRequest, user: DemoUser, id?: string, action?: string): MockResult {
    const denied = need(user, 'tickets.manage');
    if (denied) return denied;
    const visible = (t: StoredTicket) => !!this.clients.find(t.clientId, user);
    if (!id) {
      if (req.method !== 'GET') return fail(405, 'notFound');
      const status = req.query.get('status');
      const clientId = req.query.get('clientId');
      const mine = req.query.get('mine') === 'true';
      const rows = this.tickets
        .filter(visible)
        .filter((t) => !status || t.status === status)
        .filter((t) => !clientId || t.clientId === clientId)
        .filter((t) => !mine || t.assigneeId === user.profile.id)
        .map((t) => this.summary(t))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return ok({ data: rows });
    }
    const t = this.tickets.find((x) => x.id === id);
    if (!t || !visible(t)) return fail(404, 'notFound');
    if (req.method === 'GET' && !action) return ok({ data: this.full(t, true) });
    if (req.method !== 'POST') return fail(405, 'notFound');
    if (action === 'messages') return this.staffReply(req, user, t);
    if (action === 'status') {
      const status = text(req.body['status']);
      if (!(TICKET_STATUSES as readonly string[]).includes(status)) return invalid({ status: ['invalidChoice'] });
      t.status = status as StoredTicket['status'];
      t.updatedAt = new Date().toISOString();
      this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'ticket.status', entityType: 'ticket', entityId: t.id, after: { status } });
      return ok({ data: this.full(t, true) });
    }
    if (action === 'assign') {
      const assignee = text(req.body['assigneeId']);
      if (assignee && !DEMO_USERS.some((u) => u.profile.id === assignee && u.profile.type === 'staff')) return invalid({ assigneeId: ['invalidChoice'] });
      if (assignee) t.assigneeId = assignee;
      else delete t.assigneeId;
      t.updatedAt = new Date().toISOString();
      this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'ticket.assign', entityType: 'ticket', entityId: t.id, after: { assigneeId: assignee || null } });
      return ok({ data: this.full(t, true) });
    }
    return fail(404, 'notFound');
  }

  private staffReply(req: MockRequest, user: DemoUser, t: StoredTicket): MockResult {
    const body = text(req.body['body']);
    if (!body || body.length > 4000) return invalid({ body: ['required'] });
    if (t.status === 'closed') return fail(409, 'ticketClosed');
    const internal = req.body['internal'] === true;
    t.messages.push({ id: this.newId('tm'), authorId: user.profile.id, authorName: user.profile.name, side: 'staff', body, internal, at: new Date().toISOString() });
    t.updatedAt = new Date().toISOString();
    if (!internal) {
      t.status = 'answered';
      this.clientUsers(t.clientId).forEach((uid) => this.hub.notify(uid, 'ticket.reply', { subject: t.subject }, `/portal/tickets/${t.id}`));
    }
    return ok({ data: this.full(t, true) }, 201);
  }

  // ---- tickets: portal ------------------------------------------------------------------------------------------

  portalTickets(req: MockRequest, user: DemoUser, clientId: string, id?: string, action?: string): MockResult {
    const mine = (t: StoredTicket) => t.clientId === clientId;
    if (!id) {
      if (req.method === 'GET') return ok({ data: this.tickets.filter(mine).map((t) => this.summary(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
      if (req.method !== 'POST') return fail(405, 'notFound');
      const errors = validate(req.body, { subject: { kind: 'text', required: true }, category: { kind: TICKET_CATEGORIES, required: true }, body: { kind: 'text', required: true } }, false);
      if (Object.keys(errors).length) return invalid(errors);
      const now = new Date().toISOString();
      const t: StoredTicket = {
        id: this.newId('tk'), clientId, subject: text(req.body['subject']).slice(0, 140), category: req.body['category'] as StoredTicket['category'], status: 'open',
        createdByName: user.profile.name, createdAt: now, updatedAt: now,
        messages: [{ id: this.newId('tm'), authorId: user.profile.id, authorName: user.profile.name, side: 'client', body: text(req.body['body']).slice(0, 4000), internal: false, at: now }],
      };
      this.tickets.push(t);
      this.recipientsFor(clientId).forEach((uid) => this.hub.notify(uid, 'ticket.new', { subject: t.subject, client: this.clients.clientName(clientId) }, `/app/tickets/${t.id}`));
      this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'ticket.create', entityType: 'ticket', entityId: t.id, after: { clientId } });
      return ok({ data: this.full(t, false) }, 201);
    }
    const t = this.tickets.find((x) => x.id === id);
    // Another client's ticket is indistinguishable from one that does not exist.
    if (!t || !mine(t)) return fail(404, 'notFound');
    if (req.method === 'GET' && !action) return ok({ data: this.full(t, false) });
    if (req.method !== 'POST') return fail(405, 'notFound');
    if (action === 'messages') {
      const body = text(req.body['body']);
      if (!body || body.length > 4000) return invalid({ body: ['required'] });
      if (t.status === 'closed') return fail(409, 'ticketClosed');
      t.messages.push({ id: this.newId('tm'), authorId: user.profile.id, authorName: user.profile.name, side: 'client', body, internal: false, at: new Date().toISOString() });
      t.status = 'open';
      t.updatedAt = new Date().toISOString();
      const targets = t.assigneeId ? [t.assigneeId] : this.recipientsFor(clientId);
      targets.forEach((uid) => this.hub.notify(uid, 'ticket.reply', { subject: t.subject, client: this.clients.clientName(clientId) }, `/app/tickets/${t.id}`));
      return ok({ data: this.full(t, false) }, 201);
    }
    if (action === 'close') {
      t.status = 'closed';
      t.updatedAt = new Date().toISOString();
      return ok({ data: this.full(t, false) });
    }
    return fail(404, 'notFound');
  }

  // ---- appointments ---------------------------------------------------------------------------------------------

  private staffAppointments(req: MockRequest, user: DemoUser, id?: string, action?: string): MockResult {
    const denied = need(user, 'appointments.manage');
    if (denied) return denied;
    if (!id) {
      if (req.method !== 'GET') return fail(405, 'notFound');
      const status = req.query.get('status');
      const rows = this.appointments
        .filter((a) => !!this.clients.find(a.clientId, user))
        .filter((a) => !status || a.status === status)
        .map((a) => this.appointmentDto(a))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return ok({ data: rows });
    }
    const a = this.appointments.find((x) => x.id === id);
    if (!a || !this.clients.find(a.clientId, user)) return fail(404, 'notFound');
    if (req.method !== 'POST') return fail(405, 'notFound');
    const note = text(req.body['note']);
    const notifyClient = (kind: string) => this.clientUsers(a.clientId).forEach((uid) => this.hub.notify(uid, kind, { topic: a.topic, when: a.startsAt.replace('T', ' ') }, '/portal/appointments'));
    if (action === 'confirm') {
      if (a.status !== 'requested' && a.status !== 'confirmed') return fail(409, 'invalidTransition');
      const startsAt = text(req.body['startsAt']) || a.startsAt;
      if (!DATETIME.test(startsAt) || startsAt.slice(0, 10) < mockToday()) return invalid({ startsAt: ['invalidDate'] });
      const clash = this.appointments.find((x) => x.id !== a.id && x.status === 'confirmed' && x.staffId === user.profile.id && x.startsAt.slice(0, 10) === startsAt.slice(0, 10) && minutesOf(x.startsAt.slice(11)) < minutesOf(startsAt.slice(11)) + a.durationMin && minutesOf(startsAt.slice(11)) < minutesOf(x.startsAt.slice(11)) + x.durationMin);
      if (clash) return fail(409, 'appointmentConflict');
      Object.assign(a, { status: 'confirmed', startsAt, staffId: user.profile.id, decidedAt: new Date().toISOString(), ...(note ? { note } : {}) });
      notifyClient('appointment.confirmed');
      return ok({ data: this.appointmentDto(a) });
    }
    if (action === 'decline') {
      if (a.status !== 'requested') return fail(409, 'invalidTransition');
      if (!note) return invalid({ note: ['required'] });
      Object.assign(a, { status: 'declined', note, decidedAt: new Date().toISOString() });
      notifyClient('appointment.declined');
      return ok({ data: this.appointmentDto(a) });
    }
    if (action === 'complete') {
      if (a.status !== 'confirmed') return fail(409, 'invalidTransition');
      a.status = 'completed';
      return ok({ data: this.appointmentDto(a) });
    }
    return fail(404, 'notFound');
  }

  portalAppointments(req: MockRequest, user: DemoUser, clientId: string, id?: string, action?: string): MockResult {
    if (!id) {
      if (req.method === 'GET') return ok({ data: this.appointments.filter((a) => a.clientId === clientId).map((a) => this.appointmentDto(a)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) });
      if (req.method !== 'POST') return fail(405, 'notFound');
      const errors = validate(req.body, { topic: { kind: 'text', required: true } }, false);
      const startsAt = text(req.body['startsAt']);
      if (!DATETIME.test(startsAt) || startsAt.slice(0, 10) <= mockToday()) errors['startsAt'] = ['invalidDate'];
      if (!(APPOINTMENT_DURATIONS as readonly unknown[]).includes(req.body['durationMin'])) errors['durationMin'] = ['invalidChoice'];
      if (Object.keys(errors).length) return invalid(errors);
      const a: StoredAppointment = { id: this.newId('ap'), clientId, topic: text(req.body['topic']).slice(0, 140), startsAt, durationMin: req.body['durationMin'] as number, status: 'requested', requestedByName: user.profile.name, createdAt: new Date().toISOString() };
      this.appointments.push(a);
      this.recipientsFor(clientId).forEach((uid) => this.hub.notify(uid, 'appointment.requested', { topic: a.topic, client: this.clients.clientName(clientId), when: startsAt.replace('T', ' ') }, '/app/appointments'));
      return ok({ data: this.appointmentDto(a) }, 201);
    }
    const a = this.appointments.find((x) => x.id === id && x.clientId === clientId);
    if (!a) return fail(404, 'notFound');
    if (req.method === 'POST' && action === 'cancel') {
      if (a.status !== 'requested' && a.status !== 'confirmed') return fail(409, 'invalidTransition');
      a.status = 'cancelled';
      return ok({ data: this.appointmentDto(a) });
    }
    return fail(404, 'notFound');
  }

  // ---- notifications (both sides) -------------------------------------------------------------------------------

  notifications(req: MockRequest, user: DemoUser, a?: string, b?: string): MockResult {
    const me = user.profile.id;
    if (!a && req.method === 'GET') return { status: 200, body: this.hub.list(me) };
    if (a === 'read-all' && req.method === 'POST') {
      this.hub.markAllRead(me);
      return ok(null, 204);
    }
    if (a && b === 'read' && req.method === 'POST') return this.hub.markRead(me, a) ? ok(null, 204) : fail(404, 'notFound');
    return fail(404, 'notFound');
  }

  // ---- timesheets -----------------------------------------------------------------------------------------------

  private entryDto(e: StoredEntry): TimeEntry {
    return clean({ ...e, userName: nameOf(e.userId), ...(e.clientId ? { clientName: this.clients.clientName(e.clientId) } : {}) });
  }

  private timesheets(req: MockRequest, user: DemoUser, a?: string, b?: string): MockResult {
    const me = user.profile.id;
    if (a === 'pending' && req.method === 'GET') return this.pending(user);
    if (a === 'submit' && req.method === 'POST') return this.submitWeek(req, user);
    if (a === 'decide' && req.method === 'POST') return this.decideWeek(req, user);
    if (a !== 'entries') return fail(404, 'notFound');
    const denied = need(user, 'timesheets.log');
    if (denied) return denied;
    if (!b) {
      if (req.method === 'GET') {
        const approver = has(user, 'timesheets.approve');
        const userId = req.query.get('userId') || me;
        if (userId !== me && !approver) return fail(403, 'forbidden');
        const from = req.query.get('from') ?? '0000-01-01';
        const to = req.query.get('to') ?? '9999-12-31';
        return ok({ data: this.entries.filter((e) => e.userId === userId && e.date >= from && e.date <= to).sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id)).map((e) => this.entryDto(e)) });
      }
      return req.method === 'POST' ? this.saveEntry(req, user) : fail(405, 'notFound');
    }
    const entry = this.entries.find((e) => e.id === b && e.userId === me);
    if (!entry) return fail(404, 'notFound');
    if (entry.status === 'submitted' || entry.status === 'approved') return fail(409, 'timesheetLocked');
    if (req.method === 'PUT') return this.saveEntry(req, user, entry);
    if (req.method === 'DELETE') {
      this.entries.splice(this.entries.indexOf(entry), 1);
      return ok(null, 204);
    }
    return fail(405, 'notFound');
  }

  private saveEntry(req: MockRequest, user: DemoUser, existing?: StoredEntry): MockResult {
    const errors = validate(req.body, { date: { kind: 'date', required: true }, note: { kind: 'text', required: true }, billable: { kind: 'bool', required: true } }, false);
    const minutes = req.body['minutes'];
    if (!Number.isInteger(minutes) || (minutes as number) < 5 || (minutes as number) > 1440) errors['minutes'] = ['invalidNumber'];
    const clientId = text(req.body['clientId']);
    if (clientId && !this.clients.find(clientId, user)) errors['clientId'] = ['invalidChoice'];
    if (req.body['billable'] === true && !clientId) errors['clientId'] = ['required'];
    const date = text(req.body['date']);
    // The mock's business day is fixed for determinism; never reject a day the browser already calls today.
    if (!errors['date'] && date > (new Date().toISOString().slice(0, 10) > mockToday() ? new Date().toISOString().slice(0, 10) : mockToday())) errors['date'] = ['invalidDate'];
    if (Object.keys(errors).length) return invalid(errors);
    const day = this.entries.filter((e) => e.userId === user.profile.id && e.date === date && e.id !== existing?.id).reduce((n, e) => n + e.minutes, 0);
    if (day + (minutes as number) > 1440) return invalid({ minutes: ['timesheetDay'] });
    const fields = { date, minutes: minutes as number, note: text(req.body['note']), billable: req.body['billable'] as boolean, weekStart: weekStartOf(date), ...(clientId ? { clientId } : {}) };
    if (existing) {
      if (!clientId) delete existing.clientId;
      Object.assign(existing, fields, { status: 'draft' });
      return ok({ data: this.entryDto(existing) });
    }
    const entry: StoredEntry = { id: this.newId('te'), userId: user.profile.id, status: 'draft', ...fields };
    this.entries.push(entry);
    return ok({ data: this.entryDto(entry) }, 201);
  }

  private submitWeek(req: MockRequest, user: DemoUser): MockResult {
    const denied = need(user, 'timesheets.log');
    if (denied) return denied;
    const weekStart = weekStartOf(text(req.body['weekStart']) || mockToday());
    const mine = this.entries.filter((e) => e.userId === user.profile.id && e.weekStart === weekStart && (e.status === 'draft' || e.status === 'rejected'));
    if (!mine.length) return fail(409, 'timesheetEmpty');
    mine.forEach((e) => {
      e.status = 'submitted';
      delete e.decisionNote;
    });
    DEMO_USERS.filter((u) => u.profile.type === 'staff' && has(u, 'timesheets.approve') && u.profile.id !== user.profile.id).forEach((u) => this.hub.notify(u.profile.id, 'timesheet.submitted', { who: user.profile.name }, '/app/timesheets'));
    return ok({ data: mine.map((e) => this.entryDto(e)) });
  }

  private pending(user: DemoUser): MockResult {
    const denied = need(user, 'timesheets.approve');
    if (denied) return denied;
    const groups = new Map<string, PendingWeek>();
    for (const e of this.entries.filter((x) => x.status === 'submitted' && x.userId !== user.profile.id)) {
      const key = `${e.userId}|${e.weekStart}`;
      const g = groups.get(key) ?? { userId: e.userId, userName: nameOf(e.userId), weekStart: e.weekStart, minutes: 0, billableMinutes: 0, entries: 0 };
      g.minutes += e.minutes;
      g.billableMinutes += e.billable ? e.minutes : 0;
      g.entries += 1;
      groups.set(key, g);
    }
    return ok({ data: [...groups.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.userName.localeCompare(b.userName)) });
  }

  private decideWeek(req: MockRequest, user: DemoUser): MockResult {
    const denied = need(user, 'timesheets.approve');
    if (denied) return denied;
    const userId = text(req.body['userId']);
    const weekStart = text(req.body['weekStart']);
    const action = text(req.body['action']);
    const note = text(req.body['note']);
    if (action !== 'approve' && action !== 'reject') return invalid({ action: ['invalidChoice'] });
    if (userId === user.profile.id) return fail(409, 'timesheetSelf');
    if (action === 'reject' && !note) return invalid({ note: ['required'] });
    const rows = this.entries.filter((e) => e.userId === userId && e.weekStart === weekStart && e.status === 'submitted');
    if (!rows.length) return fail(404, 'notFound');
    rows.forEach((e) => Object.assign(e, { status: action === 'approve' ? 'approved' : 'rejected', decidedBy: user.profile.name, ...(note ? { decisionNote: note } : {}) }));
    this.hub.notify(userId, action === 'approve' ? 'timesheet.approved' : 'timesheet.rejected', { week: weekStart }, '/app/timesheets');
    this.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action: `timesheet.${action}`, entityType: 'timesheet', entityId: `${userId}:${weekStart}`, after: { entries: rows.length } });
    return ok({ data: rows.map((e) => this.entryDto(e)) });
  }
}
