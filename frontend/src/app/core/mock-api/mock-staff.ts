import { MockApprovals } from './mock-approvals';
import { MockAudit } from './mock-audit';
import { MockClients } from './mock-clients';
import { MockDocuments } from './mock-documents';
import { MockLedger } from './mock-ledger';
import { MockOnboarding } from './mock-onboarding';
import { MockModule, MockRequest, MockResult, fail } from './mock-types';
import { MockTasks } from './mock-tasks';
import { DemoUser } from './mock-users';

type Route = [RegExp, MockModule];

/** Owns the staff-side mock modules and routes a path below /api/v1/staff to the one that serves it. */
export class MockStaff {
  private readonly routes: Route[];

  constructor(audit: MockAudit) {
    const clients = new MockClients();
    const documents = new MockDocuments(clients);
    const onboarding = new MockOnboarding(clients, documents);
    this.routes = [
      [/^clients\/[^/]+\/onboarding(\/|$)/, onboarding],
      [/^(clients\/[^/]+\/(documents|document-requests)|documents|document-requests)(\/|$)/, documents],
      [/^tasks(\/|$)/, new MockTasks(clients)],
      [/^approvals(\/|$)/, new MockApprovals(onboarding)],
      [/^ledger(\/|$)/, new MockLedger(clients, audit)],
      [/^audit(\/|$)/, audit],
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
