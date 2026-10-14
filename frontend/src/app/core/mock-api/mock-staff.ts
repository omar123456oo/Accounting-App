import { MockApprovals } from './mock-approvals';
import { MockAudit } from './mock-audit';
import { MockClients } from './mock-clients';
import { MockDocuments } from './mock-documents';
import { MockLedger } from './mock-ledger';
import { MockEngage } from './mock-engage';
import { MockHr } from './mock-hr';
import { MockHrm } from './mock-hrm';
import { NotificationHub } from './mock-notifications';
import { MockPortal } from './mock-portal';
import { MockRoles } from './mock-roles';
import { MockOnboarding } from './mock-onboarding';
import { MockModule, MockRequest, MockResult, fail } from './mock-types';
import { MockTasks } from './mock-tasks';
import { DemoUser } from './mock-users';

type Route = [RegExp, MockModule];

/** Owns the staff-side mock modules and routes a path below /api/v1/staff to the one that serves it. */
export class MockStaff {
  private readonly routes: Route[];
  /** The client portal API shares the stores below; the backend routes /api/v1/portal here. */
  readonly portal: MockPortal;

  constructor(audit: MockAudit) {
    const clients = new MockClients();
    const documents = new MockDocuments(clients);
    const onboarding = new MockOnboarding(clients, documents);
    const hub = new NotificationHub();
    const engage = new MockEngage(clients, hub, audit);
    const ledger = new MockLedger(clients, audit);
    this.portal = new MockPortal(engage, clients, documents, ledger);
    this.routes = [
      [/^clients\/[^/]+\/onboarding(\/|$)/, onboarding],
      [/^(clients\/[^/]+\/(documents|document-requests)|documents|document-requests)(\/|$)/, documents],
      [/^tasks(\/|$)/, new MockTasks(clients)],
      [/^approvals(\/|$)/, new MockApprovals(onboarding)],
      [/^ledger(\/|$)/, ledger],
      [/^audit(\/|$)/, audit],
      [/^hr(\/|$)/, new MockHr(audit, hub)],
      [/^hrm(\/|$)/, new MockHrm(audit)],
      [/^(tickets|appointments|notifications|timesheets)(\/|$)/, engage],
      [/^(roles|role-users|permission-catalogue)(\/|$)/, new MockRoles(audit)],
      [/^(clients|assignable-users)(\/|$)/, clients],
    ];
  }

  /** True when some module serves the path; other paths fall through to a plain 404. */
  serves(path: string): boolean {
    return this.routes.some(([pattern]) => pattern.test(path));
  }

  handle(req: MockRequest, user: DemoUser): MockResult | Promise<MockResult> {
    const module = this.routes.find(([pattern]) => pattern.test(req.path))?.[1];
    return module ? module.handle(req, user) : fail(404, 'notFound');
  }
}
