import { DocLine, DocLineInput, Invoice } from '../../features/commercial/commercial.models';
import { isPositive, normalize, sub, sum } from '../money/money';
import { Rules, validate } from './mock-clients-rules';
import { LinesOutcome, buildLines, effectiveStatus, invoiceNeedsApproval, isError, isOpen, parseTerms, planInstallments, scheduleOf, totalsOf, yearLabel } from './mock-commercial-calc';
import { canPost, linkOf, postSystemJournal, Need, requireMappings } from './mock-commercial-posting';
import { StoredInvoice } from './mock-commercial-store';
import { LedgerCtx } from './mock-ledger-store';
import { DocEvent } from '../../features/commercial/commercial.models';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { date: { kind: 'date', required: true }, partyId: { kind: 'text', required: true } };

export function docEvent(ctx: LedgerCtx, action: string, outcome?: string): DocEvent {
  return { action, actor: ctx.user.profile.name, actorId: ctx.user.profile.id, at: new Date().toISOString(), ...(outcome ? { outcome } : {}) };
}

export function invoiceDto(inv: StoredInvoice): Invoice {
  const { revenueEvents: _events, ...rest } = inv;
  return structuredClone({ ...rest, status: effectiveStatus(inv), schedule: scheduleOf(inv), requiresApproval: invoiceNeedsApproval(inv.total) });
}

/** The lines as the user entered them, for re-pricing a draft against the rates in force when it is issued. */
export const inputsOf = (lines: readonly DocLine[]): DocLineInput[] =>
  lines.map((l) => ({ description: l.description, ...(l.serviceTypeId ? { serviceTypeId: l.serviceTypeId } : {}), ...(l.categoryId ? { categoryId: l.categoryId } : {}), qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, ...(l.taxRateId ? { taxRateId: l.taxRateId } : {}) }));

export function handleInvoices(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') return need(user, 'invoices.view') ?? list(ctx);
    return req.method === 'POST' ? (need(user, 'invoices.create') ?? create(ctx)) : fail(405, 'notFound');
  }
  const inv = store.commercial.invoice(entity.id, id);
  if (action && req.method === 'POST') return actionOn(ctx, inv, action);
  const denied = need(user, req.method === 'GET' ? 'invoices.view' : 'invoices.create');
  if (denied) return denied;
  if (!inv) return fail(404, 'notFound');
  if (!action && req.method === 'GET') return ok({ data: invoiceDto(inv) });
  if (!action && req.method === 'PATCH') return inv.status === 'draft' ? update(ctx, inv) : fail(409, inv.status === 'pending_approval' ? 'conflict' : 'docImmutable');
  if (!action && req.method === 'DELETE') {
    if (inv.status !== 'draft') return fail(409, 'docImmutable');
    store.commercial.invoices = store.commercial.invoices.filter((x) => x !== inv);
    releaseRebills(ctx, inv.id);
    return ok(null, 204);
  }
  return fail(404, 'notFound');
}

/** A draft invoice that is deleted or cancelled gives its re-billed expenses back, so they can be added to another invoice. */
function releaseRebills(ctx: LedgerCtx, invoiceId: string): void {
  for (const bill of ctx.store.commercial.bills) if (bill.rebilledInvoiceId === invoiceId) delete bill.rebilledInvoiceId;
}

function list(ctx: LedgerCtx): MockResult {
  const q = ctx.req.query;
  const term = (q.get('q') ?? '').trim().toLowerCase();
  const rows = ctx.store.commercial.invoices
    .filter((i) => i.ledgerEntityId === ctx.entity.id)
    .filter((i) => !q.get('status') || effectiveStatus(i) === q.get('status'))
    .filter((i) => !q.get('partyId') || i.partyId === q.get('partyId'))
    .filter((i) => !term || [i.reference, i.partyName, i.notes].some((v) => v?.toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map(invoiceDto);
  return paged(rows, pageQuery(q));
}

interface Parsed {
  fields: Pick<StoredInvoice, 'partyId' | 'partyName' | 'date' | 'dueDate' | 'termsKind' | 'termsDays' | 'lines' | 'net' | 'taxTotal' | 'total' | 'usesUnverifiedRate' | 'servicePeriodStart' | 'servicePeriodMonths' | 'notes'>;
}

/** Validates a create/update body against the current rates, parties and service types. */
export function parseInvoice(ctx: LedgerCtx, body: Record<string, unknown>): Parsed | { error: MockResult } {
  const errors = validate(body, RULES, false);
  const party = ctx.store.commercial.party(ctx.entity.id, body['partyId'], 'customer');
  if (!errors['partyId'] && !party) errors['partyId'] = ['invalidChoice'];
  if (party?.archived) errors['partyId'] = ['partyArchived'];
  if (Object.keys(errors).length || !party) return { error: invalid(errors) };
  const date = text(body['date']);
  const terms = parseTerms(body, date);
  if ('error' in terms) return terms;
  const built: LinesOutcome = buildLines(ctx, 'ar', body['lines'], date);
  if (isError(built)) return built;
  const months = body['servicePeriodMonths'] === undefined || body['servicePeriodMonths'] === '' ? undefined : Number(body['servicePeriodMonths']);
  const start = text(body['servicePeriodStart']);
  const deferred = built.lines.some((l) => l.recognition === 'deferred_over_period');
  if (deferred && (!start || !months || !Number.isInteger(months) || months < 1 || months > 60)) return { error: invalid({ servicePeriodStart: ['servicePeriodRequired'] }) };
  const totals = totalsOf(built.lines);
  return {
    fields: {
      partyId: party.id,
      partyName: party.name,
      date,
      dueDate: terms.dueDate,
      termsKind: terms.termsKind,
      termsDays: terms.termsDays,
      lines: built.lines,
      ...totals,
      usesUnverifiedRate: built.usesUnverified,
      ...(deferred ? { servicePeriodStart: start, servicePeriodMonths: months } : {}),
      ...(text(body['notes']) ? { notes: text(body['notes']) } : {}),
    },
  };
}

function create(ctx: LedgerCtx): MockResult {
  const parsed = parseInvoice(ctx, ctx.req.body);
  if ('error' in parsed) return parsed.error;
  const c = ctx.store.commercial;
  const inv: StoredInvoice = {
    id: c.nextId('inv'),
    ledgerEntityId: ctx.entity.id,
    reference: c.newDraftRef('INV'),
    ...parsed.fields,
    status: 'draft',
    paid: '0',
    credited: '0',
    balance: '0',
    currency: 'EGP',
    requiresApproval: invoiceNeedsApproval(parsed.fields.total),
    journals: [],
    schedule: [],
    reminders: [],
    revenueEvents: [],
    createdBy: ctx.user.profile.id,
    createdByName: ctx.user.profile.name,
    history: [docEvent(ctx, 'created')],
  };
  c.invoices.push(inv);
  return ok({ data: invoiceDto(inv) }, 201);
}

function update(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  const merged = { ...invoiceDto(inv), ...ctx.req.body, lines: 'lines' in ctx.req.body ? ctx.req.body['lines'] : inputsOf(inv.lines) } as Record<string, unknown>;
  const parsed = parseInvoice(ctx, merged);
  if ('error' in parsed) return parsed.error;
  Object.assign(inv, parsed.fields, { requiresApproval: invoiceNeedsApproval(parsed.fields.total) });
  if (!parsed.fields.servicePeriodStart) {
    delete inv.servicePeriodStart;
    delete inv.servicePeriodMonths;
  }
  inv.history.push(docEvent(ctx, 'updated'));
  return ok({ data: invoiceDto(inv) });
}

function actionOn(ctx: LedgerCtx, inv: StoredInvoice | undefined, action: string): MockResult {
  const permission = { submit: 'invoices.create', cancel: 'invoices.create', remind: 'invoices.create', issue: 'invoices.issue', recognize: 'invoices.issue', approve: 'invoices.approve', reject: 'invoices.approve' }[action];
  if (!permission) return fail(404, 'notFound');
  const denied = need(ctx.user, permission);
  if (denied) return denied;
  if (!inv) return fail(404, 'notFound');
  switch (action) {
    case 'submit':
      return submit(ctx, inv);
    case 'cancel':
      return cancel(ctx, inv);
    case 'remind':
      return remind(ctx, inv);
    case 'issue':
      return inv.status !== 'draft' ? fail(409, 'conflict') : invoiceNeedsApproval(inv.total) ? invalid({ approval: ['approvalRequired'] }) : (issueInvoice(ctx, inv) ?? ok({ data: invoiceDto(inv) }));
    case 'approve':
      return approve(ctx, inv);
    case 'reject':
      return reject(ctx, inv);
    default:
      return recognize(ctx, inv);
  }
}

function submit(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  if (inv.status !== 'draft') return fail(409, 'conflict');
  if (!isPositive(inv.total)) return invalid({ lines: ['amountInvalid'] });
  inv.status = 'pending_approval';
  inv.history.push(docEvent(ctx, 'submitted'));
  return ok({ data: invoiceDto(inv) });
}

function cancel(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  if (inv.status !== 'draft' && inv.status !== 'pending_approval') return fail(409, 'docImmutable');
  inv.status = 'cancelled';
  releaseRebills(ctx, inv.id);
  inv.history.push(docEvent(ctx, 'cancelled', text(ctx.req.body['reason']) || undefined));
  return ok({ data: invoiceDto(inv) });
}

function reject(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  if (inv.status !== 'pending_approval') return fail(409, 'conflict');
  const reason = text(ctx.req.body['reason']);
  if (!reason) return invalid({ reason: ['required'] });
  inv.status = 'draft';
  inv.history.push(docEvent(ctx, 'rejected', reason));
  return ok({ data: invoiceDto(inv) });
}

/** Four-eyes: the approver is a different user, and approving issues the invoice in the same atomic step. */
function approve(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  if (inv.status !== 'pending_approval') return fail(409, 'conflict');
  if (inv.createdBy === ctx.user.profile.id) return fail(403, 'fourEyesDoc');
  return issueInvoice(ctx, inv, ctx.user.profile.id, text(ctx.req.body['comment']) || undefined) ?? ok({ data: invoiceDto(inv) });
}

function remind(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  if (effectiveStatus(inv) !== 'overdue') return fail(409, 'notOverdue');
  const note = text(ctx.req.body['note']) || undefined;
  inv.reminders.push({ at: new Date().toISOString(), actor: ctx.user.profile.name, delivery: 'logged_only', ...(note ? { note } : {}) });
  inv.history.push(docEvent(ctx, 'reminder_logged', note));
  return ok({ data: invoiceDto(inv) });
}

/** Lines of the issue journal: receivable debited, revenue (or deferred revenue) and output VAT credited. */
export function issueLines(ctx: LedgerCtx, inv: StoredInvoice): { lines: Array<[string, string, string]> } | { error: MockResult } {
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const needs: Need[] = ['arControl'];
  // A deferred line needs its revenue account too, or it could be issued but never recognized.
  for (const l of inv.lines) needs.push(...(l.recognition === 'deferred_over_period' ? (['deferredRevenue', { service: l.serviceTypeId as string }] as Need[]) : [{ service: l.serviceTypeId as string }]));
  if (isPositive(inv.taxTotal)) needs.push('vatOutput');
  const missing = requireMappings(m, needs);
  if (missing) return { error: missing };
  const lines: Array<[string, string, string]> = [[m.arControl as string, inv.total, '0']];
  for (const l of inv.lines) lines.push([l.recognition === 'deferred_over_period' ? (m.deferredRevenue as string) : (m.revenueByService[l.serviceTypeId as string]), '0', l.net]);
  if (isPositive(inv.taxTotal)) lines.push([m.vatOutput as string, '0', inv.taxTotal]);
  return { lines };
}

/**
 * Issues a draft or approved invoice in one atomic step. Everything that can fail (rates, mappings, period,
 * balance) is checked first; only then the number is taken, the journal posted and the invoice updated, so a
 * refusal leaves the invoice a draft with no number and no journal. Returns null on success.
 */
export function issueInvoice(ctx: LedgerCtx, inv: StoredInvoice, approver?: string, comment?: string): MockResult | null {
  const party = ctx.store.commercial.party(ctx.entity.id, inv.partyId, 'customer');
  if (!party) return fail(404, 'notFound');
  // Re-price against the rates in force now: the issued invoice snapshots them for good.
  const built = buildLines(ctx, 'ar', inputsOf(inv.lines), inv.date);
  if (isError(built)) return built.error;
  const totals = totalsOf(built.lines);
  if (!isPositive(totals.total)) return invalid({ lines: ['amountInvalid'] });
  const deferred = built.lines.some((l) => l.recognition === 'deferred_over_period');
  if (deferred && (!inv.servicePeriodStart || !inv.servicePeriodMonths)) return invalid({ servicePeriodStart: ['servicePeriodRequired'] });
  const candidate: StoredInvoice = { ...inv, lines: built.lines, ...totals };
  const built2 = issueLines(ctx, candidate);
  if ('error' in built2) return built2.error;
  const blocked = canPost(ctx, inv.date, built2.lines);
  if (blocked) return blocked;

  const number = ctx.store.commercial.nextNumber(ctx.entity.id, 'invoice', yearLabel(ctx, inv.date), 'INV');
  const posted = postSystemJournal(ctx, { date: inv.date, description: `Invoice ${number} - ${inv.partyName}`, lines: built2.lines, sourceType: 'invoice', sourceId: inv.id, ...(approver ? { approvedBy: approver } : {}) });
  if ('error' in posted) return posted.error;
  Object.assign(candidate, { number, reference: number, status: 'issued', balance: candidate.total, paid: '0', credited: '0' });
  for (const l of candidate.lines) {
    if (l.recognition === 'deferred_over_period') l.deferredRemaining = l.net;
    else if (l.serviceTypeId) candidate.revenueEvents.push({ date: inv.date, serviceTypeId: l.serviceTypeId, amount: l.net });
  }
  candidate.journals = [linkOf(posted.journal, 'issue')];
  if (approver) {
    candidate.approvedBy = approver;
    candidate.history = [...candidate.history, docEvent(ctx, 'approved', comment)];
  }
  candidate.history = [...candidate.history, docEvent(ctx, 'issued', number)];
  Object.assign(inv, candidate);
  return null;
}

/** Posts one journal per due installment (Dr deferred revenue, Cr revenue) up to a date, all or nothing. */
function recognize(ctx: LedgerCtx, inv: StoredInvoice): MockResult {
  const upTo = text(ctx.req.body['upTo']);
  const errors = validate({ upTo }, { upTo: { kind: 'date', required: true } }, false);
  if (Object.keys(errors).length) return invalid(errors);
  if (!isOpen(inv.status) && inv.status !== 'paid') return fail(409, 'conflict');
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const due = planInstallments(inv).filter((i) => i.date <= upTo);
  if (due.length === 0) return ok({ data: invoiceDto(inv), meta: { recognized: 0 } });
  const missing = requireMappings(m, ['deferredRevenue', ...inv.lines.filter((l) => l.recognition === 'deferred_over_period').map((l) => ({ service: l.serviceTypeId as string }))]);
  if (missing) return missing;
  const plans = due.map((inst) => {
    const lines: Array<[string, string, string]> = [[m.deferredRevenue as string, inst.amount, '0']];
    inst.perLine.forEach((amount, i) => {
      if (isPositive(amount)) lines.push([m.revenueByService[inv.lines[i].serviceTypeId as string], '0', amount]);
    });
    return { inst, lines };
  });
  for (const p of plans) {
    const blocked = canPost(ctx, p.inst.date, p.lines);
    if (blocked) return blocked;
  }
  for (const { inst, lines } of plans) {
    const posted = postSystemJournal(ctx, { date: inst.date, description: `Revenue recognition ${inv.reference} (${inst.n}/${inv.servicePeriodMonths})`, lines, sourceType: 'invoice_recognition', sourceId: inv.id });
    if ('error' in posted) return posted.error;
    inst.perLine.forEach((amount, i) => {
      const line = inv.lines[i];
      if (!isPositive(amount) || !line.serviceTypeId) return;
      line.deferredRemaining = normalize(sub(line.deferredRemaining ?? '0', amount));
      inv.revenueEvents.push({ date: inst.date, serviceTypeId: line.serviceTypeId, amount: normalize(amount) });
    });
    inv.schedule.push({ n: inst.n, date: inst.date, amount: normalize(inst.amount), status: 'recognized', journalId: posted.journal.id });
    inv.journals.push(linkOf(posted.journal, 'recognition'));
  }
  inv.history.push(docEvent(ctx, 'revenue_recognized', `${due.length}`));
  return ok({ data: invoiceDto(inv), meta: { recognized: due.length } });
}

/** Total still deferred (liability) across invoices: used by the reconciliation. */
export const deferredBalance = (invoices: readonly StoredInvoice[]): string => sum(invoices.filter((i) => i.number).flatMap((i) => i.lines.map((l) => l.deferredRemaining ?? '0')));
