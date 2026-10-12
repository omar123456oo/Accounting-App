import { Quotation } from '../../features/commercial/commercial.models';
import { addDaysIso } from '../../features/commercial/doc-calc';
import { Rules, validate } from './mock-clients-rules';
import { buildLines, invoiceNeedsApproval, isError, totalsOf, yearLabel } from './mock-commercial-calc';
import { docEvent, inputsOf } from './mock-commercial-invoices';
import { StoredInvoice, StoredQuotation } from './mock-commercial-store';
import { mockToday } from './mock-clock';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { partyId: { kind: 'text', required: true }, date: { kind: 'date', required: true }, validUntil: { kind: 'date', required: true } };

const dto = (q: StoredQuotation): Quotation => structuredClone(q);

/** Quotations: draft -> sent (numbered) -> accepted or rejected -> converted into a draft invoice. */
export function handleQuotations(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const mine = store.commercial.quotations.filter((q) => q.ledgerEntityId === entity.id);
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') {
      const denied = need(user, 'invoices.view');
      if (denied) return denied;
      const status = req.query.get('status');
      return paged(mine.filter((q) => !status || q.status === status).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map(dto), pageQuery(req.query));
    }
    return req.method === 'POST' ? (need(user, 'invoices.create') ?? create(ctx)) : fail(405, 'notFound');
  }
  const q = mine.find((x) => x.id === id);
  if (req.method === 'GET' && !action) return need(user, 'invoices.view') ?? (q ? ok({ data: dto(q) }) : fail(404, 'notFound'));
  if (req.method !== 'POST' || !action) return fail(404, 'notFound');
  const denied = need(user, 'invoices.create');
  if (denied) return denied;
  if (!q) return fail(404, 'notFound');
  switch (action) {
    case 'send':
      return move(ctx, q, 'draft', 'sent');
    case 'accept':
      return move(ctx, q, 'sent', 'accepted');
    case 'reject':
      return move(ctx, q, 'sent', 'rejected');
    case 'convert':
      return convert(ctx, q);
    default:
      return fail(404, 'notFound');
  }
}

function create(ctx: LedgerCtx): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, RULES, false);
  const c = ctx.store.commercial;
  const party = c.party(ctx.entity.id, body['partyId'], 'customer');
  if (!errors['partyId'] && !party) errors['partyId'] = ['invalidChoice'];
  if (!errors['validUntil'] && !errors['date'] && text(body['validUntil']) < text(body['date'])) errors['validUntil'] = ['invalidDate'];
  if (Object.keys(errors).length || !party) return invalid(errors);
  const date = text(body['date']);
  const built = buildLines(ctx, 'ar', body['lines'], date);
  if (isError(built)) return built.error;
  const q: StoredQuotation = {
    id: c.nextId('qt'),
    ledgerEntityId: ctx.entity.id,
    reference: c.newDraftRef('QT'),
    partyId: party.id,
    partyName: party.name,
    date,
    validUntil: text(body['validUntil']),
    status: 'draft',
    lines: built.lines,
    ...totalsOf(built.lines),
    usesUnverifiedRate: built.usesUnverified,
    ...(text(body['notes']) ? { notes: text(body['notes']) } : {}),
    createdByName: ctx.user.profile.name,
  };
  c.quotations.push(q);
  return ok({ data: dto(q) }, 201);
}

function move(ctx: LedgerCtx, q: StoredQuotation, from: Quotation['status'], to: Quotation['status']): MockResult {
  if (q.status !== from) return fail(409, 'conflict');
  if (to === 'sent') {
    q.number = ctx.store.commercial.nextNumber(ctx.entity.id, 'quotation', yearLabel(ctx, q.date), 'QT');
    q.reference = q.number;
  }
  q.status = to;
  return ok({ data: dto(q) });
}

function convert(ctx: LedgerCtx, q: StoredQuotation): MockResult {
  if (q.status !== 'accepted' && q.status !== 'sent') return fail(409, 'conflict');
  const c = ctx.store.commercial;
  const party = c.party(ctx.entity.id, q.partyId, 'customer');
  if (!party || party.archived) return invalid({ partyId: ['partyArchived'] });
  const date = mockToday();
  const built = buildLines(ctx, 'ar', inputsOf(q.lines), date);
  if (isError(built)) return built.error;
  const totals = totalsOf(built.lines);
  const deferred = built.lines.some((l) => l.recognition === 'deferred_over_period');
  const inv: StoredInvoice = {
    id: c.nextId('inv'),
    ledgerEntityId: ctx.entity.id,
    reference: c.newDraftRef('INV'),
    partyId: party.id,
    partyName: party.name,
    date,
    dueDate: addDaysIso(date, party.paymentTermsDays),
    termsKind: 'custom',
    termsDays: party.paymentTermsDays,
    lines: built.lines,
    ...totals,
    usesUnverifiedRate: built.usesUnverified,
    ...(deferred ? { servicePeriodStart: date, servicePeriodMonths: 12 } : {}),
    status: 'draft',
    paid: '0',
    credited: '0',
    balance: '0',
    currency: 'EGP',
    requiresApproval: invoiceNeedsApproval(totals.total),
    journals: [],
    schedule: [],
    reminders: [],
    revenueEvents: [],
    sourceQuotationId: q.id,
    createdBy: ctx.user.profile.id,
    createdByName: ctx.user.profile.name,
    history: [docEvent(ctx, 'created', q.reference)],
  };
  c.invoices.push(inv);
  q.status = 'converted';
  q.convertedInvoiceId = inv.id;
  return ok({ data: { quotation: dto(q), invoiceId: inv.id } }, 201);
}
