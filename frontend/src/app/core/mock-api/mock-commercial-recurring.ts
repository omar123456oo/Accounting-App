import { RecurringDoc, Side } from '../../features/commercial/commercial.models';
import { Rules, validate } from './mock-clients-rules';
import { buildLines, isError, parseTerms } from './mock-commercial-calc';
import { billDto, newBill, parseBill } from './mock-commercial-bills';
import { invoiceDto, parseInvoice, docEvent } from './mock-commercial-invoices';
import { invoiceNeedsApproval } from './mock-commercial-calc';
import { StoredInvoice } from './mock-commercial-store';
import { mockToday } from './mock-clock';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { name: { kind: 'text', required: true }, partyId: { kind: 'text', required: true } };
const PERMISSION: Record<Side, string> = { ar: 'invoices.create', ap: 'bills.create' };
const VIEW: Record<Side, string> = { ar: 'invoices.view', ap: 'bills.view' };

/** Recurring invoice and expense templates: a plain list and a "create draft" action. There is no scheduler. */
export function handleRecurring(ctx: LedgerCtx, side: Side, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const c = store.commercial;
  const mine = c.recurring.filter((r) => r.ledgerEntityId === entity.id && r.side === side);
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') return need(user, VIEW[side]) ?? ok({ data: structuredClone(mine) });
    return req.method === 'POST' ? (need(user, PERMISSION[side]) ?? create(ctx, side)) : fail(405, 'notFound');
  }
  const template = mine.find((r) => r.id === id);
  const denied = need(user, PERMISSION[side]);
  if (denied) return denied;
  if (!template) return fail(404, 'notFound');
  if (req.method === 'DELETE' && !action) {
    c.recurring = c.recurring.filter((r) => r !== template);
    return ok(null, 204);
  }
  if (req.method === 'POST' && action === 'create-draft') return createDraft(ctx, side, template);
  return fail(404, 'notFound');
}

function create(ctx: LedgerCtx, side: Side): MockResult {
  const body = ctx.req.body;
  const c = ctx.store.commercial;
  const errors = validate(body, RULES, false);
  const party = c.party(ctx.entity.id, body['partyId'], side === 'ar' ? 'customer' : 'supplier');
  if (!errors['partyId'] && !party) errors['partyId'] = ['invalidChoice'];
  if (Object.keys(errors).length || !party) return invalid(errors);
  const terms = parseTerms(body, mockToday());
  if ('error' in terms) return terms.error;
  const built = buildLines(ctx, side, body['lines'], mockToday());
  if (isError(built)) return built.error;
  const template: RecurringDoc = {
    id: c.nextId('rec'),
    ledgerEntityId: ctx.entity.id,
    side,
    name: text(body['name']),
    partyId: party.id,
    partyName: party.name,
    termsKind: terms.termsKind,
    termsDays: terms.termsDays,
    lines: built.lines.map((l) => ({ description: l.description, ...(l.serviceTypeId ? { serviceTypeId: l.serviceTypeId } : { categoryId: l.categoryId }), qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, ...(l.taxRateId ? { taxRateId: l.taxRateId } : {}) })),
    ...(side === 'ap' && body['bearer'] === 'client_reimbursable' ? { bearer: 'client_reimbursable' as const } : {}),
  };
  c.recurring.push(template);
  return ok({ data: structuredClone(template) }, 201);
}

function createDraft(ctx: LedgerCtx, side: Side, t: RecurringDoc): MockResult {
  const errors = validate(ctx.req.body, { date: { kind: 'date', required: true } }, false);
  if (Object.keys(errors).length) return invalid(errors);
  const body = { partyId: t.partyId, date: text(ctx.req.body['date']), termsKind: t.termsKind, termsDays: t.termsDays, lines: t.lines, notes: t.name, bearer: t.bearer ?? 'firm' };
  const c = ctx.store.commercial;
  if (side === 'ap') {
    const parsed = parseBill(ctx, body);
    if ('error' in parsed) return parsed.error;
    const bill = newBill(ctx, parsed.fields);
    bill.history.push(docEvent(ctx, 'created_from_template', t.name));
    return ok({ data: billDto(bill) }, 201);
  }
  const parsed = parseInvoice(ctx, body);
  if ('error' in parsed) return parsed.error;
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
    history: [docEvent(ctx, 'created_from_template', t.name)],
  };
  c.invoices.push(inv);
  return ok({ data: invoiceDto(inv) }, 201);
}
