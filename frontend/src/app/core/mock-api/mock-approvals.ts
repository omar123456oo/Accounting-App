import { Client } from '../../features/clients/client.models';
import { OnboardingCase } from '../../features/clients/onboarding/onboarding.models';
import { ApprovalItem } from '../../features/workflows/workflows.models';
import { MockOnboarding } from './mock-onboarding';
import { MockModule, MockRequest, MockResult, fail, need, ok, pageQuery, paged } from './mock-types';
import { DemoUser } from './mock-users';

/**
 * The approvals inbox. Today the only source is onboarding (the final approval); the item id is the case id
 * with an "ap-" prefix. Deciding here goes through the onboarding rules, so permissions and four-eyes still apply.
 */
export class MockApprovals implements MockModule {
  constructor(private readonly onboarding: MockOnboarding) {}

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, id, action] = req.path.split('/');
    const denied = need(user, 'workflows.approve');
    if (denied) return denied;
    if (!id) return req.method === 'GET' ? this.list(req.query, user) : fail(405, 'notFound');
    if (req.method !== 'POST' || (action !== 'approve' && action !== 'reject')) return fail(404, 'notFound');
    const found = this.onboarding.caseById(id.replace(/^ap-/, ''), user);
    if (!found) return fail(404, 'notFound');
    if (found.kase.stage !== 'approval') return fail(409, 'alreadyDecided');
    const result =
      action === 'approve'
        ? this.onboarding.advance({ to: 'completed', comment: req.body['comment'] }, found.client, found.kase, user)
        : this.onboarding.reject({ comment: req.body['comment'] }, found.kase, user);
    if (result.status !== 200) return result;
    return ok({ data: this.items(user).find((i) => i.id === id) });
  }

  private list(q: URLSearchParams, user: DemoUser): MockResult {
    const status = q.get('status');
    const rows = this.items(user).filter((i) => !status || i.status === status);
    return paged(rows, { ...pageQuery(q), dir: 1 });
  }

  private items(user: DemoUser): ApprovalItem[] {
    return this.onboarding
      .casesFor(user)
      .flatMap(({ kase, client }) => this.itemOf(kase, client) ?? [])
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.id.localeCompare(b.id));
  }

  private itemOf(kase: OnboardingCase, client: Client): ApprovalItem | null {
    const submitted = [...kase.history].reverse().find((e) => e.to === 'approval');
    if (!submitted) return null;
    const base = { id: `ap-${kase.id}`, kind: 'onboarding' as const, clientId: client.id, clientName: client.legalName, requestedBy: submitted.actor, requestedById: submitted.actorId, requestedAt: submitted.at };
    if (kase.stage === 'approval') return { ...base, status: 'pending' };
    const decision = [...kase.history].reverse().find((e) => e.from === 'approval');
    if (!decision) return null;
    return {
      ...base,
      status: decision.to === 'completed' ? 'approved' : 'rejected',
      decidedBy: decision.actor,
      decidedAt: decision.at,
      ...(decision.comment ? { comment: decision.comment } : {}),
    };
  }
}
