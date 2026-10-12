import { eventHash, GENESIS_HASH } from '../../features/audit/audit-chain';
import { AuditEvent } from '../../features/audit/audit.models';
import { AuditInput, AuditSink } from './mock-audit-sink';
import { MockModule, MockRequest, MockResult, fail, need, ok, pageQuery, paged } from './mock-types';
import { DemoUser } from './mock-users';

const ORGANIZATION = 'org-demo';

/**
 * The central audit store of the mock: an append-only, per-organization hash chain. Events get their seq at once;
 * the SHA-256 (Web Crypto, asynchronous) is chained behind them, and every read waits for the chain to settle.
 * Events are never edited or deleted through the API. Verification is done by the client from the data it reads.
 */
export class MockAudit implements AuditSink, MockModule {
  /** Exposed for tests that tamper with a stored event to prove that verification detects it. */
  readonly events: AuditEvent[] = [];
  private tail: Promise<void> = Promise.resolve();
  private lastHash = GENESIS_HASH;

  record(input: AuditInput): void {
    const event: AuditEvent = {
      seq: this.events.length + 1,
      organizationId: ORGANIZATION,
      actorId: input.actorId ?? '',
      actorName: input.actorName ?? '',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? '',
      before: input.before === undefined ? '' : JSON.stringify(input.before),
      after: input.after === undefined ? '' : JSON.stringify(input.after),
      occurredAt: new Date().toISOString(),
      prevHash: '',
      hash: '',
    };
    this.events.push(event);
    this.tail = this.tail.then(async () => {
      event.prevHash = this.lastHash;
      event.hash = await eventHash(event, event.prevHash);
      this.lastHash = event.hash;
    });
  }

  /** Resolves when every recorded event has its hash. */
  settled(): Promise<void> {
    return this.tail;
  }

  async handle(req: MockRequest, user: DemoUser): Promise<MockResult> {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, name] = req.path.split('/');
    if (name === 'exports' && req.method === 'POST') {
      const report = typeof req.body['report'] === 'string' ? req.body['report'] : '';
      this.record({ actorId: user.profile.id, actorName: user.profile.name, action: 'export.csv', entityType: 'report', entityId: report, after: { ledgerEntityId: req.body['ledgerEntityId'] ?? null } });
      return ok(null, 204);
    }
    const denied = need(user, 'audit.view');
    if (denied) return denied;
    if (req.method !== 'GET') return fail(405, 'notFound');
    await this.settled();
    if (name === 'chain') return ok({ data: structuredClone(this.events) });
    if (name !== 'events') return fail(404, 'notFound');
    const q = req.query;
    const term = (q.get('q') ?? '').trim().toLowerCase();
    const rows = this.events
      .filter((e) => !q.get('action') || e.action === q.get('action'))
      .filter((e) => !q.get('actorId') || e.actorId === q.get('actorId'))
      .filter((e) => !q.get('entityType') || e.entityType === q.get('entityType'))
      .filter((e) => !q.get('from') || e.occurredAt.slice(0, 10) >= q.get('from')!)
      .filter((e) => !q.get('to') || e.occurredAt.slice(0, 10) <= q.get('to')!)
      .filter((e) => !term || [e.entityId, e.actorName, e.action].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => b.seq - a.seq);
    const facets = { actions: [...new Set(this.events.map((e) => e.action))].sort(), entityTypes: [...new Set(this.events.map((e) => e.entityType))].sort(), actors: [...new Map(this.events.filter((e) => e.actorId).map((e) => [e.actorId, e.actorName])).entries()].map(([id, n]) => ({ id, name: n })) };
    const page = paged(structuredClone(rows), pageQuery(q));
    return { ...page, body: { ...(page.body as object), facets } };
  }
}
