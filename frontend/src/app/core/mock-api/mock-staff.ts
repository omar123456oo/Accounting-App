import { MockApprovals } from './mock-approvals';
import { MockClients } from './mock-clients';
import { MockDocuments } from './mock-documents';
import { MockOnboarding } from './mock-onboarding';
import { MockModule, MockRequest, MockResult, fail } from './mock-types';
import { MockTasks } from './mock-tasks';
import { DemoUser } from './mock-users';

type Route = [RegExp, MockModule];

/** Owns the staff-side mock modules and routes a path below /api/v1/staff to the one that serves it. */
export class MockStaff {
  private readonly clients = new MockClients();
  private readonly documents = new MockDocuments(this.clients);
  private readonly onboarding = new MockOnboarding(this.clients, this.documents);
  private readonly routes: Route[] = [
    [/^clients\/[^/]+\/onboarding(\/|$)/, this.onboarding],
    [/^(clients\/[^/]+\/(documents|document-requests)|documents|document-requests)(\/|$)/, this.documents],
    [/^tasks(\/|$)/, new MockTasks(this.clients)],
    [/^approvals(\/|$)/, new MockApprovals(this.onboarding)],
    [/^(clients|assignable-users)(\/|$)/, this.clients],
  ];

  /** True when some module serves the path; other paths fall through to a plain 404. */
  serves(path: string): boolean {
    return this.routes.some(([pattern]) => pattern.test(path));
  }

  handle(req: MockRequest, user: DemoUser): MockResult | Promise<MockResult> {
    const module = this.routes.find(([pattern]) => pattern.test(req.path))?.[1];
    return module ? module.handle(req, user) : fail(404, 'notFound');
  }
}
