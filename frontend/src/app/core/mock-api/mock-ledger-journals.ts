import { JournalEvent } from '../../features/accounting/accounting.models';
import { mockToday } from './mock-clock';
import { Rules, validate } from './mock-clients-rules';
import { journalDto, linesError, needsHighApproval, parseLines, readiness, swapped } from './mock-ledger-journal-rules';
import { LedgerCtx, StoredJournal, isPosted } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';

const RULES: Rules = {
  entryType: { kind: ['standard', 'opening'] },
  postingDate: { kind: 'date', required: true },
  description: { kind: 'text', required: true },
};
/** Journals created by the commercial module are corrected from their document, never by hand. */
export const isCommercialSource = (t: string | undefined): boolean => !!t && COMMERCIAL_SOURCES.includes(t);
const COMMERCIAL_SOURCES = ['invoice', 'invoice_recognition', 'credit_note', 'customer_payment', 'customer_credit_allocation', 'customer_refund', 'supplier_bill', 'supplier_credit', 'supplier_payment', 'supplier_credit_allocation', 'supplier_refund', 'expense_claim', 'expense_claim_payment'];
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Journal entries and the draft -> pending_approval -> approved -> posted workflow. Every rule is enforced here. */
export function handleJournals(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') return need(user, 'journals.view') ?? list(ctx);
    return req.method === 'POST' ? (need(user, 'journals.create') ?? create(ctx)) : fail(405, 'notFound');
  }
  const denied = need(user, req.method === 'GET' ? 'journals.view' : 'journals.create');
  const j = store.journals.find((x) => x.id === id && x.ledgerEntityId === entity.id);
  if (action && req.method === 'POST') return actionOn(ctx, j, action);
  if (denied) return denied;
  if (!j) return fail(404, 'notFound');
  if (!action && req.method === 'GET') return ok({ data: journalDto(store, j) });
  if (!action && req.method === 'PATCH') return j.status === 'draft' ? update(ctx, j) : fail(409, immutableKey(j));
  if (!action && req.method === 'DELETE') return j.status === 'draft' ? remove(ctx, j) : fail(409, immutableKey(j));
  return fail(404, 'notFound');
}

const immutableKey = (j: StoredJournal) => (isPosted(j) ? ('postedImmutable' as const) : ('conflict' as const));

export function event(ctx: LedgerCtx, action: JournalEvent['action'], outcome?: string): JournalEvent {
  return { actor: ctx.user.profile.name, actorId: ctx.user.profile.id, action, at: new Date().toISOString(), ...(outcome ? { outcome } : {}) };
}

function list(ctx: LedgerCtx): MockResult {
  const q = ctx.req.query;
  const term = (q.get('q') ?? '').trim().toLowerCase();
  const rows = ctx.store.journals
    .filter((j) => j.ledgerEntityId === ctx.entity.id)
    .filter((j) => !q.get('status') || j.status === q.get('status'))
    .filter((j) => !q.get('from') || j.postingDate >= q.get('from')!)
    .filter((j) => !q.get('to') || j.postingDate <= q.get('to')!)
    .filter((j) => !q.get('accountId') || j.lines.some((l) => l.accountId === q.get('accountId')))
    .filter((j) => !term || [j.number, j.draftRef, j.description].some((v) => v?.toLowerCase().includes(term)))
    .sort((a, b) => b.postingDate.localeCompare(a.postingDate) || b.id.localeCompare(a.id))
    .map((j) => journalDto(ctx.store, j));
  return paged(rows, pageQuery(q));
}

function create(ctx: LedgerCtx): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, RULES, false);
  const lines = parseLines(ctx.store, ctx.entity.id, body['lines']);
  if (!lines) Object.assign(errors, linesError('lineInvalid'));
  if (Object.keys(errors).length || !lines) return invalid(errors);
  const j: StoredJournal = {
    id: ctx.store.nextId('je'),
    ledgerEntityId: ctx.entity.id,
    draftRef: ctx.store.newDraftRef(),
    entryType: (body['entryType'] as StoredJournal['entryType'] | undefined) ?? 'standard',
    postingDate: text(body['postingDate']),
    description: text(body['description']),
    status: 'draft',
    lines,
    createdBy: ctx.user.profile.id,
    history: [event(ctx, 'created')],
  };
  ctx.store.journals.push(j);
  return ok({ data: journalDto(ctx.store, j) }, 201);
}

function update(ctx: LedgerCtx, j: StoredJournal): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, RULES, true);
  const lines = 'lines' in body ? parseLines(ctx.store, ctx.entity.id, body['lines']) : j.lines;
  if (!lines) Object.assign(errors, linesError('lineInvalid'));
  if (Object.keys(errors).length || !lines) return invalid(errors);
  if ('entryType' in body) j.entryType = body['entryType'] as StoredJournal['entryType'];
  if ('postingDate' in body) j.postingDate = text(body['postingDate']);
  if ('description' in body) j.description = text(body['description']);
  j.lines = lines;
  j.history.push(event(ctx, 'updated'));
  return ok({ data: journalDto(ctx.store, j) });
}

function remove(ctx: LedgerCtx, j: StoredJournal): MockResult {
  ctx.store.journals = ctx.store.journals.filter((x) => x !== j);
  return ok(null, 204);
}

function actionOn(ctx: LedgerCtx, j: StoredJournal | undefined, action: string): MockResult {
  const permission = { submit: 'journals.create', approve: 'journals.approve', reject: 'journals.approve', post: 'journals.post', reverse: 'journals.post' }[action];
  if (!permission) return fail(404, 'notFound');
  const denied = need(ctx.user, permission);
  if (denied) return denied;
  if (!j) return fail(404, 'notFound');
  switch (action) {
    case 'submit':
      return submit(ctx, j);
    case 'approve':
      return approve(ctx, j);
    case 'reject':
      return reject(ctx, j);
    case 'post':
      return post(ctx, j);
    default:
      return reverse(ctx, j);
  }
}

function submit(ctx: LedgerCtx, j: StoredJournal): MockResult {
  if (j.status !== 'draft') return fail(409, 'conflict');
  const problem = readiness(ctx.store, j);
  if (problem) return invalid(linesError(problem));
  j.status = 'pending_approval';
  j.history.push(event(ctx, 'submitted'));
  return ok({ data: journalDto(ctx.store, j) });
}

function approve(ctx: LedgerCtx, j: StoredJournal): MockResult {
  if (j.status !== 'pending_approval') return fail(409, 'conflict');
  if (j.createdBy === ctx.user.profile.id) return fail(403, 'fourEyesJournal');
  if (needsHighApproval(j.lines)) {
    const denied = need(ctx.user, 'journals.approve_high');
    if (denied) return fail(403, 'highValueApproval');
  }
  j.status = 'approved';
  j.approvedBy = ctx.user.profile.id;
  j.history.push(event(ctx, 'approved', text(ctx.req.body['comment']) || undefined));
  return ok({ data: journalDto(ctx.store, j) });
}

function reject(ctx: LedgerCtx, j: StoredJournal): MockResult {
  if (j.status !== 'pending_approval') return fail(409, 'conflict');
  const reason = text(ctx.req.body['reason']);
  if (!reason) return invalid({ reason: ['required'] });
  j.status = 'draft';
  j.history.push(event(ctx, 'rejected', reason));
  return ok({ data: journalDto(ctx.store, j) });
}

/** Locks nothing but mirrors the DB transaction: period open, balanced, accounts usable, then the gapless number. */
export function postNow(ctx: LedgerCtx, j: StoredJournal): MockResult | null {
  const period = ctx.store.periodAt(ctx.entity.id, j.postingDate);
  if (!period || period.status !== 'open') return invalid({ postingDate: ['periodNotOpen'] });
  const problem = readiness(ctx.store, j);
  if (problem) return invalid(linesError(problem));
  j.number = ctx.store.nextNumber(ctx.entity.id, ctx.store.yearOf(period));
  j.status = 'posted';
  j.postedBy = ctx.user.profile.id;
  j.history.push(event(ctx, 'posted', j.number));
  return null;
}

function post(ctx: LedgerCtx, j: StoredJournal): MockResult {
  if (j.status !== 'approved') return fail(409, 'conflict');
  return postNow(ctx, j) ?? ok({ data: journalDto(ctx.store, j) });
}

function reverse(ctx: LedgerCtx, j: StoredJournal): MockResult {
  if (isCommercialSource(j.sourceType)) return fail(409, 'sourceManaged');
  if (j.reversedById) return fail(409, 'alreadyReversed');
  if (j.status !== 'posted' || j.reversalOfId) return fail(409, 'conflict');
  const body = ctx.req.body;
  const reason = text(body['reason']);
  const errors = validate(body, { postingDate: { kind: 'date' } }, true);
  if (!reason) errors['reason'] = ['required'];
  if (Object.keys(errors).length) return invalid(errors);
  const reversal: StoredJournal = {
    id: ctx.store.nextId('je'),
    ledgerEntityId: ctx.entity.id,
    draftRef: ctx.store.newDraftRef(),
    entryType: 'standard',
    postingDate: text(body['postingDate']) || mockToday(),
    description: `Reversal of ${j.number}: ${reason}`,
    status: 'approved',
    lines: swapped(j.lines),
    sourceType: 'reversal',
    sourceId: j.id,
    createdBy: ctx.user.profile.id,
    approvedBy: ctx.user.profile.id,
    reversalOfId: j.id,
    history: [event(ctx, 'reversal_created', j.number)],
  };
  const failed = postNow(ctx, reversal);
  if (failed) return failed;
  j.status = 'reversed';
  j.reversedById = reversal.id;
  j.history.push(event(ctx, 'reversed', reason));
  ctx.store.journals.push(reversal);
  let replacement: StoredJournal | undefined;
  if (body['createReplacement'] === true) {
    replacement = {
      id: ctx.store.nextId('je'),
      ledgerEntityId: ctx.entity.id,
      draftRef: ctx.store.newDraftRef(),
      entryType: j.entryType,
      postingDate: j.postingDate,
      description: j.description,
      status: 'draft',
      lines: structuredClone(j.lines),
      sourceType: 'replacement',
      sourceId: j.id,
      createdBy: ctx.user.profile.id,
      history: [event(ctx, 'created', j.number)],
    };
    ctx.store.journals.push(replacement);
  }
  return ok({ data: { reversal: journalDto(ctx.store, reversal), original: journalDto(ctx.store, j), ...(replacement ? { replacement: journalDto(ctx.store, replacement) } : {}) } });
}

/** Recurring templates: a plain list and "create draft from template" (no scheduler). */
export function handleTemplates(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  if (!id && req.method === 'GET') {
    return need(user, 'journals.view') ?? ok({ data: structuredClone(store.templates.filter((t) => t.ledgerEntityId === entity.id)) });
  }
  const template = store.templates.find((t) => t.id === id && t.ledgerEntityId === entity.id);
  if (!template || action !== 'create-draft' || req.method !== 'POST') return fail(404, 'notFound');
  const denied = need(user, 'journals.create');
  if (denied) return denied;
  const errors = validate(req.body, { postingDate: { kind: 'date', required: true } }, false);
  if (Object.keys(errors).length) return invalid(errors);
  const j: StoredJournal = {
    id: store.nextId('je'),
    ledgerEntityId: entity.id,
    draftRef: store.newDraftRef(),
    entryType: 'standard',
    postingDate: text(req.body['postingDate']),
    description: template.name,
    status: 'draft',
    lines: structuredClone(template.lines),
    sourceType: 'recurring_template',
    sourceId: template.id,
    createdBy: user.profile.id,
    history: [event(ctx, 'created_from_template', template.name)],
  };
  store.journals.push(j);
  return ok({ data: journalDto(store, j) }, 201);
}
