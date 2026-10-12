import { Client } from '../../features/clients/client.models';
import { AdvanceTarget, CHECKLIST_STATUSES, CHECKLIST_TRANSITIONS, ChecklistItem, ChecklistStatus, DEFAULT_CHECKLIST_TEMPLATE, OnboardingCase, OnboardingStage } from '../../features/clients/onboarding/onboarding.models';
import { MockClients } from './mock-clients';
import { validate } from './mock-clients-rules';
import { seedOnboardingCases } from './mock-onboarding-data';
import { MockModule, MockRequest, MockResult, fail, invalid, need, ok } from './mock-types';
import { DemoUser } from './mock-users';

/** What onboarding needs from the document repository: does this document exist for this client? */
export interface DocumentLookup {
  exists(documentId: string, clientId: string): boolean;
}

const NEXT: Partial<Record<OnboardingStage, AdvanceTarget>> = { document_collection: 'verification', verification: 'approval', approval: 'completed' };
const TARGETS = ['verification', 'approval', 'completed'];
const EDITABLE: readonly OnboardingStage[] = ['document_collection', 'verification'];

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const copy = (c: OnboardingCase): OnboardingCase => structuredClone(c);

/**
 * In-memory onboarding workflow. The rules live here exactly as they must on the server: stages advance
 * only in order, verification needs the documents in, approval needs everything approved, and completion
 * needs the approve permission and a different person than the one who submitted the verification.
 */
export class MockOnboarding implements MockModule {
  private readonly cases = seedOnboardingCases();
  private seq = 100;

  constructor(
    private readonly clients: MockClients,
    private readonly documents: DocumentLookup,
  ) {}

  handle(req: MockRequest, user: DemoUser): MockResult {
    if (user.profile.type !== 'staff') return fail(403, 'forbidden');
    const [, id, , sub, subId] = req.path.split('/');
    const denied = need(user, 'clients.view');
    if (denied) return denied;
    const client = this.clients.find(id, user);
    if (!client) return fail(404, 'notFound');
    const kase = this.cases.find((c) => c.clientId === id);
    if (!sub && req.method === 'POST') return this.start(client, kase, user);
    if (!kase) return fail(404, 'notFound');
    if (!sub) return req.method === 'GET' ? ok({ data: copy(kase) }) : req.method === 'PATCH' ? this.setFlags(req, kase, user) : fail(405, 'notFound');
    if (sub === 'advance' && req.method === 'POST') return this.advance(req.body, client, kase, user);
    if (sub === 'reject' && req.method === 'POST') return this.reject(req.body, kase, user);
    if (sub === 'checklist') return this.checklist(req, kase, user, subId);
    return fail(404, 'notFound');
  }

  /** Every case the user may see, with its client, for the approvals inbox. */
  casesFor(user: DemoUser): Array<{ kase: OnboardingCase; client: Client }> {
    return this.cases.flatMap((kase) => {
      const client = this.clients.find(kase.clientId, user);
      return client ? [{ kase: copy(kase), client }] : [];
    });
  }

  caseById(caseId: string, user: DemoUser): { kase: OnboardingCase; client: Client } | undefined {
    const kase = this.cases.find((c) => c.id === caseId);
    const client = kase && this.clients.find(kase.clientId, user);
    return kase && client ? { kase, client } : undefined;
  }

  private start(client: Client, existing: OnboardingCase | undefined, user: DemoUser): MockResult {
    const denied = need(user, 'clients.update');
    if (denied) return denied;
    if (existing || (client.status !== 'lead' && client.status !== 'onboarding')) return fail(409, 'conflict');
    if (client.status === 'lead' && !this.clients.applyStatus(client, 'onboarding', user)) return fail(409, 'conflict');
    const kase: OnboardingCase = {
      id: `onb-${++this.seq}`,
      clientId: client.id,
      stage: 'document_collection',
      checklist: DEFAULT_CHECKLIST_TEMPLATE.map((t) => ({ ...t, id: `ci-${++this.seq}`, status: 'missing' as const })),
      identityVerified: false,
      engagementAccepted: false,
      history: [],
    };
    this.record(kase, user, 'started', 'none', 'document_collection');
    this.cases.push(kase);
    return ok({ data: copy(kase) }, 201);
  }

  private setFlags(req: MockRequest, kase: OnboardingCase, user: DemoUser): MockResult {
    const denied = need(user, 'clients.update') ?? this.editable(kase);
    if (denied) return denied;
    const errors = validate(req.body, { identityVerified: { kind: 'bool' }, engagementAccepted: { kind: 'bool' } }, true);
    if (Object.keys(errors).length) return invalid(errors);
    if (typeof req.body['identityVerified'] === 'boolean') kase.identityVerified = req.body['identityVerified'];
    if (typeof req.body['engagementAccepted'] === 'boolean') kase.engagementAccepted = req.body['engagementAccepted'];
    return ok({ data: copy(kase) });
  }

  private editable(kase: OnboardingCase, only: readonly OnboardingStage[] = EDITABLE): MockResult | null {
    return only.includes(kase.stage) ? null : invalid({ stage: ['stageOrder'] });
  }

  private checklist(req: MockRequest, kase: OnboardingCase, user: DemoUser, itemId?: string): MockResult {
    const denied = need(user, 'clients.update');
    if (denied) return denied;
    if (req.method === 'POST' && !itemId) {
      const locked = this.editable(kase, ['document_collection']);
      if (locked) return locked;
      const errors = validate(req.body, { label: { kind: 'text', required: true }, required: { kind: 'bool' } }, false);
      if (Object.keys(errors).length) return invalid(errors);
      kase.checklist.push({ id: `ci-${++this.seq}`, label: text(req.body['label']), required: req.body['required'] !== false, status: 'missing' });
      return ok({ data: copy(kase) }, 201);
    }
    const item = kase.checklist.find((i) => i.id === itemId);
    if (!item) return fail(404, 'notFound');
    if (req.method === 'DELETE') {
      const locked = this.editable(kase, ['document_collection']);
      if (locked) return locked;
      kase.checklist.splice(kase.checklist.indexOf(item), 1);
      return ok({ data: copy(kase) });
    }
    if (req.method !== 'PATCH') return fail(405, 'notFound');
    return this.updateItem(req.body, kase, item);
  }

  private updateItem(body: Record<string, unknown>, kase: OnboardingCase, item: ChecklistItem): MockResult {
    const locked = this.editable(kase);
    if (locked) return locked;
    const status = body['status'];
    if (status !== undefined && !(CHECKLIST_STATUSES as readonly unknown[]).includes(status)) return invalid({ status: ['invalidChoice'] });
    const link = body['documentId'];
    if (typeof link === 'string' && !this.documents.exists(link, kase.clientId)) return invalid({ documentId: ['invalidChoice'] });
    if (status !== undefined && status !== item.status && !CHECKLIST_TRANSITIONS[item.status].includes(status as ChecklistStatus)) {
      return invalid({ status: ['invalidTransition'] });
    }
    if (link === null && item.status === 'approved') return invalid({ documentId: ['invalidTransition'] });
    if (typeof link === 'string') {
      item.documentId = link;
      if (item.status === 'missing' && status === undefined) item.status = 'received';
    } else if (link === null) {
      delete item.documentId;
      if (item.status === 'received' && status === undefined) item.status = 'missing';
    }
    if (status !== undefined) item.status = status as ChecklistStatus;
    return ok({ data: copy(kase) });
  }

  /** Moves a case one stage forward. Also used by the approvals inbox for the final approval. */
  advance(body: Record<string, unknown>, client: Client, kase: OnboardingCase, user: DemoUser): MockResult {
    const to = body['to'];
    if (typeof to !== 'string' || !TARGETS.includes(to)) return invalid({ to: ['invalidChoice'] });
    const denied = need(user, to === 'completed' ? 'clients.approve_onboarding' : 'clients.update');
    if (denied) return denied;
    if (NEXT[kase.stage] !== to) return invalid({ to: ['stageOrder'] });
    const required = kase.checklist.filter((i) => i.required);
    if (to === 'verification' && required.some((i) => i.status !== 'received' && i.status !== 'approved')) {
      return invalid({ checklist: ['checklistNotReceived'] });
    }
    if (to === 'approval') {
      const errors: Record<string, Array<'checklistNotApproved' | 'identityRequired' | 'engagementRequired'>> = {};
      if (required.some((i) => i.status !== 'approved')) errors['checklist'] = ['checklistNotApproved'];
      if (!kase.identityVerified) errors['identityVerified'] = ['identityRequired'];
      if (!kase.engagementAccepted) errors['engagementAccepted'] = ['engagementRequired'];
      if (Object.keys(errors).length) return invalid(errors);
    }
    if (to === 'completed') {
      const submitter = [...kase.history].reverse().find((e) => e.to === 'approval');
      if (submitter?.actorId === user.profile.id) return fail(403, 'fourEyes');
      // Reuses the client status rules: only onboarding -> active is legal, anything else is a conflict.
      if (!this.clients.applyStatus(client, 'active', user)) return fail(409, 'conflict');
    }
    this.record(kase, user, 'advanced', kase.stage, to, text(body['comment']));
    kase.stage = to;
    return ok({ data: copy(kase) });
  }

  /** Sends a case back to document collection. A rejection also clears both confirmations, so they are re-checked. */
  reject(body: Record<string, unknown>, kase: OnboardingCase, user: DemoUser): MockResult {
    if (kase.stage !== 'verification' && kase.stage !== 'approval') return invalid({ stage: ['stageOrder'] });
    const denied = need(user, kase.stage === 'approval' ? 'clients.approve_onboarding' : 'clients.update');
    if (denied) return denied;
    const comment = text(body['comment']);
    if (!comment) return invalid({ comment: ['required'] });
    this.record(kase, user, 'rejected', kase.stage, 'document_collection', comment);
    kase.stage = 'document_collection';
    kase.identityVerified = false;
    kase.engagementAccepted = false;
    return ok({ data: copy(kase) });
  }

  private record(kase: OnboardingCase, user: DemoUser, action: 'started' | 'advanced' | 'rejected', from: string, to: string, comment = ''): void {
    kase.history.push({ actorId: user.profile.id, actor: user.profile.name, action, from, to, at: new Date().toISOString(), ...(comment ? { comment } : {}) });
  }
}
