import { PortalOverview } from '../../features/engage/engage.models';
import { add } from '../money/money';
import { MockClients } from './mock-clients';
import { MockDocuments } from './mock-documents';
import { MockEngage } from './mock-engage';
import { MockLedger } from './mock-ledger';
import { mockToday } from './mock-clock';
import { MockRequest, MockResult, fail, ok } from './mock-types';
import { DemoUser } from './mock-users';

/**
 * The client portal API (/api/v1/portal). A portal user belongs to exactly one client and every handler is scoped to it,
 * so another client's tickets, documents or invoices are indistinguishable from things that do not exist (404).
 * Only what a client may see is returned: no drafts, no internal notes, no version hashes.
 */
export class MockPortal {
  constructor(
    private readonly engage: MockEngage,
    private readonly clients: MockClients,
    private readonly documents: MockDocuments,
    private readonly ledger: MockLedger,
  ) {}

  handle(req: MockRequest, user: DemoUser): MockResult {
    const clientId = user.clientId;
    if (user.profile.type !== 'client' || !clientId) return fail(403, 'forbidden');
    const [area, a, b] = req.path.split('/');
    const get = req.method === 'GET';
    switch (area) {
      case 'overview':
        return get ? ok({ data: this.overview(clientId, user) }) : fail(405, 'notFound');
      case 'invoices':
        return get ? ok({ data: this.ledger.portalInvoices(clientId) }) : fail(405, 'notFound');
      case 'documents':
        return get ? ok({ data: this.documents.portalDocuments(clientId) }) : fail(405, 'notFound');
      case 'document-requests':
        return get ? ok({ data: this.documents.portalRequests(clientId) }) : fail(405, 'notFound');
      case 'tickets':
        return this.engage.portalTickets(req, user, clientId, a, b);
      case 'appointments':
        return this.engage.portalAppointments(req, user, clientId, a, b);
      case 'notifications':
        return this.engage.notifications(req, user, a, b);
      default:
        return fail(404, 'notFound');
    }
  }

  private overview(clientId: string, user: DemoUser): PortalOverview {
    const today = mockToday();
    const unpaid = this.ledger.portalInvoices(clientId).filter((i) => i.status !== 'paid' && i.status !== 'credited' && i.balance !== '0.00' && i.balance !== '0');
    const tickets = (this.engage.portalTickets({ method: 'GET', path: 'tickets', query: new URLSearchParams(), body: {} }, user, clientId).body as { data: Array<{ status: string }> }).data;
    const appointments = (this.engage.portalAppointments({ method: 'GET', path: 'appointments', query: new URLSearchParams(), body: {} }, user, clientId).body as { data: Array<{ status: string; startsAt: string }> }).data;
    return {
      clientName: this.clients.clientName(clientId),
      openTickets: tickets.filter((t) => t.status !== 'closed').length,
      upcomingAppointments: appointments.filter((a) => (a.status === 'confirmed' || a.status === 'requested') && a.startsAt.slice(0, 10) >= today).length,
      unpaidInvoices: unpaid.length,
      unpaidAmount: unpaid.reduce((n, i) => add(n, i.balance), '0'),
      openRequests: this.documents.portalRequests(clientId).filter((r) => r.status === 'open').length,
    };
  }
}
