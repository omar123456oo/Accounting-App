import { Appointment, TimeEntry, TicketMessage, TicketSummary } from '../../features/engage/engage.models';

/** DEMO data: fictional conversations, bookings and time entries. */
export type StoredTicket = Omit<TicketSummary, 'clientName' | 'messageCount' | 'lastSide' | 'assigneeName'> & { messages: TicketMessage[] };
export type StoredAppointment = Omit<Appointment, 'clientName' | 'staffName'>;
export type StoredEntry = Omit<TimeEntry, 'userName' | 'clientName'>;

export function seedTickets(): StoredTicket[] {
  return [
    {
      id: 'tk-001', clientId: 'c-001', subject: 'VAT return for September', category: 'tax', status: 'answered', assigneeId: 'u-accountant',
      createdByName: 'Demo Client', createdAt: '2026-10-05T09:00:00.000Z', updatedAt: '2026-10-06T11:00:00.000Z',
      messages: [
        { id: 'tm-1', authorId: 'u-client', authorName: 'Demo Client', side: 'client', body: 'When will the September VAT return be ready?', internal: false, at: '2026-10-05T09:00:00.000Z' },
        { id: 'tm-2', authorId: 'u-accountant', authorName: 'Demo Accountant', side: 'staff', body: 'Internal: waiting for the last purchase invoices.', internal: true, at: '2026-10-06T10:00:00.000Z' },
        { id: 'tm-3', authorId: 'u-accountant', authorName: 'Demo Accountant', side: 'staff', body: 'It will be ready on the 15th. We will send it for your approval first.', internal: false, at: '2026-10-06T11:00:00.000Z' },
      ],
    },
    {
      id: 'tk-002', clientId: 'c-002', subject: 'Question about the monthly fee', category: 'billing', status: 'open',
      createdByName: 'Demo Client Two', createdAt: '2026-10-09T08:00:00.000Z', updatedAt: '2026-10-09T08:00:00.000Z',
      messages: [{ id: 'tm-4', authorId: 'u-client2', authorName: 'Demo Client Two', side: 'client', body: 'Is the fee for October the same as September?', internal: false, at: '2026-10-09T08:00:00.000Z' }],
    },
  ];
}

export function seedAppointments(): StoredAppointment[] {
  return [
    { id: 'ap-001', clientId: 'c-001', topic: 'Quarterly review', startsAt: '2026-10-20T11:00', durationMin: 60, status: 'confirmed', requestedByName: 'Demo Client', staffId: 'u-accountant', createdAt: '2026-10-07T09:00:00.000Z', decidedAt: '2026-10-07T10:00:00.000Z' },
    { id: 'ap-002', clientId: 'c-002', topic: 'Onboarding call', startsAt: '2026-10-22T10:00', durationMin: 30, status: 'requested', requestedByName: 'Demo Client Two', createdAt: '2026-10-10T09:00:00.000Z' },
  ];
}

export function seedEntries(): StoredEntry[] {
  const e = (id: string, userId: string, date: string, minutes: number, clientId: string | undefined, note: string, billable: boolean, status: StoredEntry['status']): StoredEntry => ({
    id, userId, date, minutes, ...(clientId ? { clientId } : {}), note, billable, status, weekStart: '2026-10-04',
  });
  return [
    e('te-001', 'u-accountant', '2026-10-04', 240, 'c-001', 'Bookkeeping September', true, 'approved'),
    e('te-002', 'u-accountant', '2026-10-05', 180, 'c-002', 'Bank reconciliation', true, 'approved'),
    e('te-003', 'u-accountant', '2026-10-06', 120, undefined, 'Team meeting and training', false, 'approved'),
    e('te-004', 'u-tax', '2026-10-05', 300, 'c-001', 'VAT workings', true, 'submitted'),
    e('te-005', 'u-tax', '2026-10-06', 240, 'c-001', 'VAT workings', true, 'submitted'),
  ];
}
