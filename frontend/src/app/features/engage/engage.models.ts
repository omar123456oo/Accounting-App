export const TICKET_STATUSES = ['open', 'answered', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_CATEGORIES = ['accounting', 'tax', 'documents', 'billing', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  side: 'client' | 'staff';
  body: string;
  /** Staff-only note. Never sent to the client portal. */
  internal: boolean;
  at: string;
}

export interface TicketSummary {
  id: string;
  clientId: string;
  clientName: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  assigneeId?: string;
  assigneeName?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** Who spoke last: "client" means the office owes an answer. */
  lastSide: 'client' | 'staff';
}

export interface Ticket extends TicketSummary {
  messages: TicketMessage[];
}

export interface TicketInput {
  subject: string;
  category: TicketCategory;
  body: string;
}

export const APPOINTMENT_STATUSES = ['requested', 'confirmed', 'declined', 'cancelled', 'completed'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90] as const;

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  topic: string;
  /** Business-time start, "YYYY-MM-DDTHH:mm". */
  startsAt: string;
  durationMin: number;
  status: AppointmentStatus;
  requestedByName: string;
  staffId?: string;
  staffName?: string;
  note?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface AppointmentInput {
  topic: string;
  startsAt: string;
  durationMin: number;
}

export interface AppNotification {
  id: string;
  kind: string;
  params: Record<string, string | number>;
  /** In-app route to open. */
  link: string;
  read: boolean;
  at: string;
}

export interface NotificationList {
  data: AppNotification[];
  meta: { unread: number };
}

export const ENTRY_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export interface TimeEntry {
  id: string;
  userId: string;
  userName: string;
  date: string;
  minutes: number;
  clientId?: string;
  clientName?: string;
  note: string;
  billable: boolean;
  status: EntryStatus;
  /** First day (Sunday) of the entry's week. */
  weekStart: string;
  decidedBy?: string;
  decisionNote?: string;
}

export interface TimeEntryInput {
  date: string;
  minutes: number;
  clientId?: string;
  note: string;
  billable: boolean;
}

export interface PendingWeek {
  userId: string;
  userName: string;
  weekStart: string;
  minutes: number;
  billableMinutes: number;
  entries: number;
}

export interface PortalOverview {
  openTickets: number;
  upcomingAppointments: number;
  unpaidInvoices: number;
  unpaidAmount: string;
  openRequests: number;
  clientName: string;
}

export interface PortalInvoice {
  id: string;
  reference: string;
  date: string;
  dueDate: string;
  total: string;
  balance: string;
  status: string;
}

export interface PortalDocument {
  id: string;
  name: string;
  category: string;
  year: number;
  reviewStatus: string;
}

export interface PortalRequest {
  id: string;
  label: string;
  dueDate: string;
  status: string;
  overdue: boolean;
}
