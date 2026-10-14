import { Adjustment, IncomeTaxCalc, ReturnCalc, ReturnEvent, RuleSnapshot, TaxReturn, WithholdingCalc } from '../../features/tax/tax.models';
import { RETURN_KINDS } from '../../features/tax/tax.models';
import { add, isPositive, isValidAmount, normalize, percentOf, sub, sum } from '../money/money';
import { Rules, validate } from './mock-clients-rules';
import { StoredReturn } from './mock-compliance-store';
import { fileProblem, storeAttachment } from './mock-attachments';
import { ETA_CLIENT } from './mock-eta';
import { periodResult } from './mock-fs-calc';
import { LedgerCtx } from './mock-ledger-store';
import { vatCalc } from './mock-tax-vat';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';
import { ComplianceStore } from './mock-compliance-store';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const OFFICIAL = ['submitted', 'accepted', 'rejected'];
const CREATE_RULES: Rules = { kind: { kind: RETURN_KINDS, required: true }, periodStart: { kind: 'date', required: true }, periodEnd: { kind: 'date', required: true } };

export function event(ctx: LedgerCtx, action: string, outcome?: string): ReturnEvent {
  return { action, actor: ctx.user.profile.name, actorId: ctx.user.profile.id, at: new Date().toISOString(), ...(outcome ? { outcome } : {}) };
}

/** The versioned income-tax rule in force at the end of the period: the chosen one, else the latest that applies. */
export function pickRule(c: ComplianceStore, periodEnd: string, ruleId?: string): RuleSnapshot | null {
  const usable = c.ruleSets.filter((r) => r.kind === 'income_tax_rate' && r.approvalStatus !== 'retired');
  const rule = ruleId ? usable.find((r) => r.id === ruleId) : usable.filter((r) => r.effectiveFrom <= periodEnd && (!r.effectiveTo || periodEnd <= r.effectiveTo)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)[0];
  if (!rule) return null;
  return { ruleId: rule.id, code: rule.code, percent: rule.percent, version: rule.version, approvalStatus: rule.approvalStatus, legalSource: rule.legalSource, effectiveFrom: rule.effectiveFrom, ...(rule.effectiveTo ? { effectiveTo: rule.effectiveTo } : {}), isDemo: rule.isDemo };
}

export function withholdingCalc(ctx: LedgerCtx, start: string, end: string): WithholdingCalc {
  const records = ctx.store.compliance.withholding.filter((w) => w.ledgerEntityId === ctx.entity.id && w.date >= start && w.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const by = (d: string) => sum(records.filter((w) => w.direction === d).map((w) => w.amount));
  return { kind: 'withholding', records: structuredClone(records), totals: { deductedByUs: by('deducted_by_us'), deductedByCustomer: by('deducted_by_customer'), count: records.length } };
}

function incomeCalc(ctx: LedgerCtx, r: StoredReturn): IncomeTaxCalc {
  const profit = periodResult(ctx, r.periodStart, r.periodEnd);
  const adds = sum(r.worksheet.adjustments.filter((a) => a.direction === 'add').map((a) => a.amount));
  const deducts = sum(r.worksheet.adjustments.filter((a) => a.direction === 'deduct').map((a) => a.amount));
  const base = sub(add(profit, adds), deducts);
  const rule = pickRule(ctx.store.compliance, r.periodEnd, r.worksheet.ruleId);
  return { kind: 'income_tax', profit, adjustments: structuredClone(r.worksheet.adjustments), adjustmentsAdd: adds, adjustmentsDeduct: deducts, taxableBase: base, rule, taxAmount: rule ? (isPositive(base) ? normalize(percentOf(base, rule.percent, 2)) : '0.0000') : null };
}

/** The live calculation, from the books as they are now. An approved return shows its frozen snapshot instead. */
export function liveCalc(ctx: LedgerCtx, r: StoredReturn): ReturnCalc {
  if (r.kind === 'vat') return vatCalc(ctx, r.periodStart, r.periodEnd);
  if (r.kind === 'withholding') return withholdingCalc(ctx, r.periodStart, r.periodEnd);
  return incomeCalc(ctx, r);
}

export function returnDto(ctx: LedgerCtx, r: StoredReturn, slim = false): TaxReturn {
  const { frozen, worksheet: _w, preparedBy, reviewedBy: _r, approvedBy: _a, ...rest } = r;
  const calc = structuredClone(frozen ?? liveCalc(ctx, r));
  if (slim && calc.kind === 'vat') calc.transactions = [];
  return structuredClone({ ...rest, preparedBy, calc, locked: !!frozen, submitBlocked: ETA_CLIENT.configured ? null : ('etaNotConfigured' as const) }) as TaxReturn;
}

const audit = (ctx: LedgerCtx, action: string, r: StoredReturn, outcome?: string): void => ctx.store.compliance.audit.record({ actorId: ctx.user.profile.id, actorName: ctx.user.profile.name, action: `tax.return.${action}`, entityType: 'tax_return', entityId: r.id, after: { state: r.state, kind: r.kind, period: `${r.periodStart}/${r.periodEnd}`, version: r.version, ...(outcome ? { outcome } : {}) } });

const find = (ctx: LedgerCtx, id: string | undefined): StoredReturn | undefined => ctx.store.compliance.returns.find((r) => r.id === id && r.ledgerEntityId === ctx.entity.id);

/** Tax returns of one ledger: prepared -> reviewed -> approved -> ready_for_submission, with four-eyes and a frozen snapshot on approval. */
export function handleReturns(ctx: LedgerCtx, rest: string[]): MockResult | Promise<MockResult> {
  const { req, user } = ctx;
  const [id, action, sub_] = rest;
  if (!id) {
    if (req.method === 'GET') return need(user, 'tax.view') ?? list(ctx);
    return req.method === 'POST' ? (need(user, 'tax.prepare') ?? create(ctx)) : fail(405, 'notFound');
  }
  const r = find(ctx, id);
  if (req.method === 'GET' && !action) return need(user, 'tax.view') ?? (r ? ok({ data: returnDto(ctx, r) }) : fail(404, 'notFound'));
  if (req.method === 'GET' && action === 'attachments' && sub_) return need(user, 'tax.view') ?? (r ? download(ctx, r, sub_) : fail(404, 'notFound'));
  if (req.method === 'PATCH' && !action) return need(user, 'tax.prepare') ?? patch(ctx, r);
  if (req.method === 'PUT' && action === 'worksheet') return need(user, 'tax.prepare') ?? (r ? worksheet(ctx, r) : fail(404, 'notFound'));
  if (req.method !== 'POST' || !action) return fail(405, 'notFound');
  const permission = { review: 'tax.review', return: 'tax.review', approve: 'tax.review', ready: 'tax.review', recalculate: 'tax.prepare', amend: 'tax.prepare', attachments: 'tax.prepare', submit: 'tax.prepare', transition: 'tax.prepare', 'record-outcome': 'tax.record_outcome' }[action];
  if (!permission) return fail(404, 'notFound');
  const denied = need(user, permission);
  if (denied) return denied;
  if (!r) return fail(404, 'notFound');
  switch (action) {
    case 'review':
      return review(ctx, r);
    case 'return':
      return sendBack(ctx, r);
    case 'approve':
      return approve(ctx, r);
    case 'ready':
      return ready(ctx, r);
    case 'recalculate':
      return recalculate(ctx, r);
    case 'amend':
      return amend(ctx, r);
    case 'attachments':
      return attach(ctx, r);
    case 'record-outcome':
      return recordOutcome(ctx, r);
    case 'submit':
      return submit(ctx, r);
    default:
      return transition(ctx, r);
  }
}

function list(ctx: LedgerCtx): MockResult {
  const q = ctx.req.query;
  const rows = ctx.store.compliance.returns
    .filter((r) => r.ledgerEntityId === ctx.entity.id)
    .filter((r) => !q.get('kind') || r.kind === q.get('kind'))
    .filter((r) => !q.get('state') || r.state === q.get('state'))
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.version - a.version)
    .map((r) => returnDto(ctx, r, true));
  return paged(rows, pageQuery(q));
}

export function createReturn(ctx: LedgerCtx, kind: StoredReturn['kind'], periodStart: string, periodEnd: string, amends?: StoredReturn): StoredReturn {
  const c = ctx.store.compliance;
  const r: StoredReturn = {
    id: c.nextId('ret'),
    ledgerEntityId: ctx.entity.id,
    kind,
    periodStart,
    periodEnd,
    version: (amends?.version ?? 0) + 1,
    ...(amends ? { amendsReturnId: amends.id } : {}),
    state: 'prepared',
    preparedBy: ctx.user.profile.id,
    preparedByName: ctx.user.profile.name,
    worksheet: amends ? structuredClone(amends.worksheet) : { adjustments: [] },
    attachments: [],
    submission: { status: 'not_submitted' },
    history: [event(ctx, amends ? 'amendment_created' : 'prepared', amends ? `v${amends.version}` : undefined)],
  };
  c.returns.push(r);
  if (amends) amends.supersededById = r.id;
  return r;
}

function create(ctx: LedgerCtx): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, CREATE_RULES, false);
  const start = text(body['periodStart']);
  const end = text(body['periodEnd']);
  if (!errors['periodEnd'] && end < start) errors['periodEnd'] = ['invalidDate'];
  if (Object.keys(errors).length) return invalid(errors);
  const kind = body['kind'] as StoredReturn['kind'];
  if (ctx.store.compliance.returns.some((r) => r.ledgerEntityId === ctx.entity.id && r.kind === kind && r.periodStart === start && r.periodEnd === end && !r.supersededById)) return fail(409, 'periodHasReturn');
  const r = createReturn(ctx, kind, start, end);
  audit(ctx, 'prepared', r);
  return ok({ data: returnDto(ctx, r) }, 201);
}

const notDone = (r: StoredReturn): MockResult | null => (r.supersededById ? fail(409, 'returnState') : null);

function review(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.state !== 'prepared' || r.supersededById) return fail(409, 'returnState');
  if (r.preparedBy === ctx.user.profile.id) return fail(403, 'fourEyesReview');
  if (r.kind === 'income_tax' && !incomeCalc(ctx, r).rule) return invalid({ rule: ['noRule'] });
  r.state = 'reviewed';
  r.reviewedBy = ctx.user.profile.id;
  r.reviewedByName = ctx.user.profile.name;
  r.history.push(event(ctx, 'reviewed', text(ctx.req.body['comment']) || undefined));
  audit(ctx, 'reviewed', r);
  return ok({ data: returnDto(ctx, r) });
}

function sendBack(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.state !== 'reviewed') return fail(409, 'returnState');
  const reason = text(ctx.req.body['reason']);
  if (!reason) return invalid({ reason: ['required'] });
  r.state = 'prepared';
  delete r.reviewedBy;
  delete r.reviewedByName;
  r.history.push(event(ctx, 'returned_to_preparer', reason));
  audit(ctx, 'returned_to_preparer', r, reason);
  return ok({ data: returnDto(ctx, r) });
}

/** Approval freezes the calculation: later changes to documents, rates or rules never alter an approved return. */
function approve(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.state !== 'reviewed') return fail(409, 'returnState');
  if (r.preparedBy === ctx.user.profile.id) return fail(403, 'fourEyesReview');
  r.frozen = structuredClone(liveCalc(ctx, r));
  r.state = 'approved';
  r.approvedBy = ctx.user.profile.id;
  r.approvedByName = ctx.user.profile.name;
  r.history.push(event(ctx, 'approved', text(ctx.req.body['comment']) || undefined));
  audit(ctx, 'approved', r);
  return ok({ data: returnDto(ctx, r) });
}

function ready(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.state !== 'approved') return fail(409, 'returnState');
  r.state = 'ready_for_submission';
  r.history.push(event(ctx, 'marked_ready_for_submission'));
  audit(ctx, 'ready_for_submission', r);
  return ok({ data: returnDto(ctx, r) });
}

function recalculate(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.frozen) return fail(409, 'returnLocked');
  if (r.state !== 'prepared') return fail(409, 'returnState');
  r.history.push(event(ctx, 'recalculated'));
  return ok({ data: returnDto(ctx, r) });
}

/** An amendment is a NEW version linked to the original; the original stays exactly as it was filed. */
function amend(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (!r.frozen || r.supersededById) return fail(409, 'returnState');
  const next = createReturn(ctx, r.kind, r.periodStart, r.periodEnd, r);
  r.history.push(event(ctx, 'superseded_by_amendment', `v${next.version}`));
  audit(ctx, 'amended', next, `v${r.version}`);
  return ok({ data: returnDto(ctx, next) }, 201);
}

function worksheet(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.kind !== 'income_tax') return fail(409, 'wrongKind');
  if (r.frozen) return fail(409, 'returnLocked');
  if (r.state !== 'prepared') return fail(409, 'returnState');
  const raw = ctx.req.body['adjustments'];
  if (!Array.isArray(raw)) return invalid({ adjustments: ['required'] });
  const adjustments: Adjustment[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const amount = text(item['amount']);
    if (!text(item['label']) || !isValidAmount(amount) || !isPositive(amount) || (item['direction'] !== 'add' && item['direction'] !== 'deduct')) return invalid({ adjustments: ['amountInvalid'] });
    adjustments.push({ id: text(item['id']) || ctx.store.compliance.nextId('adj'), label: text(item['label']), direction: item['direction'], amount: normalize(amount) });
  }
  const ruleId = text(ctx.req.body['ruleId']);
  if (ruleId && !ctx.store.compliance.ruleSets.some((x) => x.id === ruleId && x.kind === 'income_tax_rate' && x.approvalStatus !== 'retired')) return invalid({ ruleId: ['invalidChoice'] });
  r.worksheet = { adjustments, ...(ruleId ? { ruleId } : {}) };
  r.history.push(event(ctx, 'worksheet_updated', `${adjustments.length}`));
  return ok({ data: returnDto(ctx, r) });
}

async function attach(ctx: LedgerCtx, r: StoredReturn): Promise<MockResult> {
  const blocked = notDone(r);
  if (blocked) return blocked;
  const bad = await fileProblem(ctx.req.body['file']);
  if (bad) return bad;
  const file = ctx.req.body['file'] as File;
  const att = await storeAttachment(ctx, r.id, file, text(ctx.req.body['name']));
  r.attachments.push(att);
  r.history.push(event(ctx, 'attachment_added', att.name));
  audit(ctx, 'attachment_added', r, att.name);
  return ok({ data: returnDto(ctx, r) }, 201);
}

function download(ctx: LedgerCtx, r: StoredReturn, attId: string): MockResult {
  const blob = ctx.store.compliance.blobs.get(`${r.id}:${attId}`);
  return blob && r.attachments.some((a) => a.id === attId) ? { status: 200, body: blob } : fail(404, 'notFound');
}

/**
 * A person records what the authority's portal showed. This is NOT a system-verified outcome: it needs the
 * portal reference, an evidence document and the recorder's name, and it is stored and shown as "recorded manually".
 */
async function recordOutcome(ctx: LedgerCtx, r: StoredReturn): Promise<MockResult> {
  if (r.state !== 'ready_for_submission' || r.submission.status !== 'not_submitted') return fail(409, 'returnState');
  const body = ctx.req.body;
  const errors: Record<string, Array<'outcomeInvalid' | 'referenceRequired' | 'recorderRequired' | 'evidenceRequired'>> = {};
  if (body['outcome'] !== 'accepted' && body['outcome'] !== 'rejected') errors['outcome'] = ['outcomeInvalid'];
  if (!text(body['referenceNo'])) errors['referenceNo'] = ['referenceRequired'];
  if (!text(body['recordedByName'])) errors['recordedByName'] = ['recorderRequired'];
  if (!(body['evidence'] instanceof Blob)) errors['file'] = ['evidenceRequired'];
  if (Object.keys(errors).length) return invalid(errors);
  const bad = await fileProblem(body['evidence']);
  if (bad) return bad;
  const evidence = await storeAttachment(ctx, r.id, body['evidence'] as File, text(body['referenceNo']));
  r.submission = {
    status: 'recorded_manually',
    manual: { outcome: body['outcome'] as 'accepted' | 'rejected', referenceNo: text(body['referenceNo']), evidence, recordedByName: text(body['recordedByName']), recordedBy: ctx.user.profile.id, recordedAt: new Date().toISOString(), ...(text(body['note']) ? { note: text(body['note']) } : {}) },
  };
  r.history.push(event(ctx, 'outcome_recorded_manually', `${body['outcome'] as string}: ${text(body['referenceNo'])}`));
  audit(ctx, 'outcome_recorded_manually', r, text(body['referenceNo']));
  return ok({ data: returnDto(ctx, r) });
}

/** Submission goes through the ETA adapter, which here is the NullEtaClient: it always refuses. */
function submit(ctx: LedgerCtx, r: StoredReturn): MockResult {
  if (r.state !== 'ready_for_submission') return fail(409, 'returnState');
  const result = ETA_CLIENT.submit(r);
  return fail(409, result.reason);
}

/** Nobody can move a return to an official state through the API. */
function transition(ctx: LedgerCtx, r: StoredReturn): MockResult {
  return OFFICIAL.includes(text(ctx.req.body['to'])) ? fail(409, 'officialStateForbidden') : fail(404, 'notFound');
}

function patch(ctx: LedgerCtx, r: StoredReturn | undefined): MockResult {
  const body = ctx.req.body;
  const wanted = [body['state'], body['status'], (body['submission'] as { status?: unknown } | undefined)?.status].map((v) => text(v));
  if (wanted.some((w) => OFFICIAL.includes(w))) return fail(409, 'officialStateForbidden');
  if (!r) return fail(404, 'notFound');
  return 'state' in body || 'status' in body || 'submission' in body ? fail(403, 'forbidden') : fail(405, 'notFound');
}
