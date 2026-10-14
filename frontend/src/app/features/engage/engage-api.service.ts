import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Appointment, AppointmentInput, NotificationList, PendingWeek, PortalDocument, PortalInvoice, PortalOverview, PortalRequest, Ticket, TicketInput, TicketSummary, TimeEntry, TimeEntryInput } from './engage.models';

const STAFF = '/api/v1/staff';
const PORTAL = '/api/v1/portal';
export type Side = 'staff' | 'portal';

const root = (side: Side): string => (side === 'staff' ? STAFF : PORTAL);

/** Tickets, appointments and notifications exist on both sides; the side picks the API root and so the rules. */
@Injectable({ providedIn: 'root' })
export class EngageApiService {
  private readonly http = inject(HttpClient);

  private data<T>(o: Observable<{ data: T }>): Observable<T> {
    return o.pipe(map((r) => r.data));
  }

  // notifications
  notifications(side: Side): Observable<NotificationList> {
    return this.http.get<NotificationList>(`${root(side)}/notifications`);
  }
  markRead(side: Side, id: string): Observable<void> {
    return this.http.post<void>(`${root(side)}/notifications/${id}/read`, {});
  }
  markAllRead(side: Side): Observable<void> {
    return this.http.post<void>(`${root(side)}/notifications/read-all`, {});
  }

  // tickets
  tickets(side: Side, filter: { status?: string; mine?: boolean } = {}): Observable<TicketSummary[]> {
    let params = new HttpParams();
    if (filter.status) params = params.set('status', filter.status);
    if (filter.mine) params = params.set('mine', 'true');
    return this.data(this.http.get<{ data: TicketSummary[] }>(`${root(side)}/tickets`, { params }));
  }
  ticket(side: Side, id: string): Observable<Ticket> {
    return this.data(this.http.get<{ data: Ticket }>(`${root(side)}/tickets/${id}`));
  }
  createTicket(input: TicketInput): Observable<Ticket> {
    return this.data(this.http.post<{ data: Ticket }>(`${PORTAL}/tickets`, input));
  }
  reply(side: Side, id: string, body: string, internal = false): Observable<Ticket> {
    return this.data(this.http.post<{ data: Ticket }>(`${root(side)}/tickets/${id}/messages`, side === 'staff' ? { body, internal } : { body }));
  }
  setTicketStatus(id: string, status: string): Observable<Ticket> {
    return this.data(this.http.post<{ data: Ticket }>(`${STAFF}/tickets/${id}/status`, { status }));
  }
  assignTicket(id: string, assigneeId: string): Observable<Ticket> {
    return this.data(this.http.post<{ data: Ticket }>(`${STAFF}/tickets/${id}/assign`, { assigneeId }));
  }
  closeTicket(id: string): Observable<Ticket> {
    return this.data(this.http.post<{ data: Ticket }>(`${PORTAL}/tickets/${id}/close`, {}));
  }

  // appointments
  appointments(side: Side, status?: string): Observable<Appointment[]> {
    const params = status ? new HttpParams().set('status', status) : new HttpParams();
    return this.data(this.http.get<{ data: Appointment[] }>(`${root(side)}/appointments`, { params }));
  }
  requestAppointment(input: AppointmentInput): Observable<Appointment> {
    return this.data(this.http.post<{ data: Appointment }>(`${PORTAL}/appointments`, input));
  }
  cancelAppointment(id: string): Observable<Appointment> {
    return this.data(this.http.post<{ data: Appointment }>(`${PORTAL}/appointments/${id}/cancel`, {}));
  }
  decideAppointment(id: string, action: 'confirm' | 'decline' | 'complete', body: { startsAt?: string; note?: string } = {}): Observable<Appointment> {
    return this.data(this.http.post<{ data: Appointment }>(`${STAFF}/appointments/${id}/${action}`, body));
  }

  // portal reads
  overview(): Observable<PortalOverview> {
    return this.data(this.http.get<{ data: PortalOverview }>(`${PORTAL}/overview`));
  }
  portalInvoices(): Observable<PortalInvoice[]> {
    return this.data(this.http.get<{ data: PortalInvoice[] }>(`${PORTAL}/invoices`));
  }
  portalDocuments(): Observable<PortalDocument[]> {
    return this.data(this.http.get<{ data: PortalDocument[] }>(`${PORTAL}/documents`));
  }
  portalRequests(): Observable<PortalRequest[]> {
    return this.data(this.http.get<{ data: PortalRequest[] }>(`${PORTAL}/document-requests`));
  }

  // time sheets
  entries(from: string, to: string, userId?: string): Observable<TimeEntry[]> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (userId) params = params.set('userId', userId);
    return this.data(this.http.get<{ data: TimeEntry[] }>(`${STAFF}/timesheets/entries`, { params }));
  }
  saveEntry(input: TimeEntryInput, id?: string): Observable<TimeEntry> {
    return this.data(id ? this.http.put<{ data: TimeEntry }>(`${STAFF}/timesheets/entries/${id}`, input) : this.http.post<{ data: TimeEntry }>(`${STAFF}/timesheets/entries`, input));
  }
  deleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${STAFF}/timesheets/entries/${id}`);
  }
  submitWeek(weekStart: string): Observable<TimeEntry[]> {
    return this.data(this.http.post<{ data: TimeEntry[] }>(`${STAFF}/timesheets/submit`, { weekStart }));
  }
  pendingWeeks(): Observable<PendingWeek[]> {
    return this.data(this.http.get<{ data: PendingWeek[] }>(`${STAFF}/timesheets/pending`));
  }
  decideWeek(userId: string, weekStart: string, action: 'approve' | 'reject', note = ''): Observable<TimeEntry[]> {
    return this.data(this.http.post<{ data: TimeEntry[] }>(`${STAFF}/timesheets/decide`, { userId, weekStart, action, note }));
  }
}
