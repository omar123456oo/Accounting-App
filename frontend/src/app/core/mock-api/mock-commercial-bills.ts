import { Bill, ExpenseClaim } from '../../features/commercial/commercial.models';
import { ALLOWED_KINDS, MAX_FILE_BYTES, extensionOf } from '../../features/documents/file-validation';
import { isPositive, isValidAmount, normalize } from '../money/money';
import { mockToday } from './mock-clock';
import { Rules, validate } from './mock-clients-rules';
import { LinesOutcome, buildLines, effectiveStatus, invoiceNeedsApproval, isError, parseTerms, totalsOf, withinApprovalLimit, yearLabel } from './mock-commercial-calc';
import { docEvent, inputsOf } from './mock-commercial-invoices';
import { canPost, linkOf, postSystemJournal, Need, requireMappings } from './mock-commercial-posting';
import { StoredBill, StoredClaim } from './mock-commercial-store';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { date: { kind: 'date', required: true }, partyId: { kind: 'text', required: true }, bearer: { kind: ['firm', 'client_reimbursable'] } };

export function billDto(bill: StoredBill): Bill {
  return structuredClone({ ...bill, status: effectiveStatus(bill), requiresApproval: false });
}

/** Firm-bearing expenses stay in the books of the ledger they are entered in; reimbursable ones belong to the firm ledger and name a client. */
export function bearerProblem(ctx: LedgerCtx, bearer: string, clientId: string): MockResult | null {
  if (bearer !== 'client_reimbursable') return null;
  return ctx.entity.type === 'firm' && clientId && ctx.clients.find(clientId, ctx.user) ? null : invalid({ bearer: ['bearerInvalid'] });
}

export function handleBills(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') return need(user, 'bills.view') ?? list(ctx);
    return req.method === 'POST' ? (need(user, 'bills.create') ?? create(ctx)) : fail(405, 'notFound');
  }
  const bill = store.commercial.bill(entity.id, id);
  if (action && req.method === 'POST') return actionOn(ctx, bill, action);
  const denied = need(user, req.method === 'GET' ? 'bills.view' : 'bills.create');
  if (denied) return denied;
  if (!bill) return fail(404, 'notFound');
  if (!action && req.method === 'GET') return ok({ data: billDto(bill) });
  if (!action && req.method === 'PATCH') return bill.status === 'draft' ? update(ctx, bill) : fail(409, bill.status === 'pending_approval' ? 'conflict' : 'docImmutable');
  if (!action && req.method === 'DELETE') {
    if (bill.status !== 'draft') return fail(409, 'docImmutable');
    store.commercial.bills = store.commercial.bills.filter((x) => x !== bill);
    return ok(null, 204);
  }
  return fail(404, 'notFound');
}

function list(ctx: LedgerCtx): MockResult {
  const q = ctx.req.query;
  const term = (q.get('q') ?? '').trim().toLowerCase();
  const rows = ctx.store.commercial.bills
    .filter((b) => b.ledgerEntityId === ctx.entity.id)
    .filter((b) => !q.get('status') || effectiveStatus(b) === q.get('status'))
    .filter((b) => !q.get('partyId') || b.partyId === q.get('partyId'))
    .filter((b) => !term || [b.reference, b.partyName, b.supplierInvoiceNo, b.notes].some((v) => v?.toLowerCase().includes(term)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map(billDto);
  return paged(rows, pageQuery(q));
}

type BillFields = Pick<StoredBill, 'partyId' | 'partyName' | 'date' | 'dueDate' | 'termsKind' | 'termsDays' | 'lines' | 'net' | 'taxTotal' | 'total' | 'usesUnverifiedRate' | 'bearer' | 'clientId' | 'clientName' | 'supplierInvoiceNo' | 'notes'>;

export function parseBill(ctx: LedgerCtx, body: Record<string, unknown>): { fields: BillFields } | { error: MockResult } {
  const errors = validate(body, RULES, false);
  const party = ctx.store.commercial.party(ctx.entity.id, body['partyId'], 'supplier');
  if (!errors['partyId'] && !party) errors['partyId'] = ['invalidChoice'];
  if (party?.archived) errors['partyId'] = ['partyArchived'];
  if (Object.keys(errors).length || !party) return { error: invalid(errors) };
  const bearer = (text(body['bearer']) || 'firm') as Bill['bearer'];
  const clientId = text(body['clientId']);
  const problem = bearerProblem(ctx, bearer, clientId);
  if (problem) return { error: problem };
  const date = text(body['date']);
  const terms = parseTerms(body, date);
  if ('error' in terms) return terms;
  const built: LinesOutcome = buildLines(ctx, 'ap', body['lines'], date);
  if (isError(built)) return built;
  return {
    fields: {
      partyId: party.id,
      partyName: party.name,
      date,
      dueDate: terms.dueDate,
      termsKind: terms.termsKind,
      termsDays: terms.termsDays,
      lines: built.lines,
      ...totalsOf(built.lines),
      usesUnverifiedRate: built.usesUnverified,
      bearer,
      ...(bearer === 'client_reimbursable' ? { clientId, clientName: ctx.clients.find(clientId, ctx.user)?.legalName } : {}),
      ...(text(body['supplierInvoiceNo']) ? { supplierInvoiceNo: text(body['supplierInvoiceNo']) } : {}),
      ...(text(body['notes']) ? { notes: text(body['notes']) } : {}),
    },
  };
}

export function newBill(ctx: LedgerCtx, fields: BillFields): StoredBill {
  const c = ctx.store.commercial;
  const bill: StoredBill = {
    id: c.nextId('bill'),
    ledgerEntityId: ctx.entity.id,
    reference: c.newDraftRef('BILL'),
    ...fields,
    status: 'draft',
    paid: '0',
    credited: '0',
    balance: '0',
    currency: 'EGP',
    requiresApproval: false,
    journals: [],
    createdBy: ctx.user.profile.id,
    createdByName: ctx.user.profile.name,
    history: [docEvent(ctx, 'created')],
  };
  c.bills.push(bill);
  return bill;
}

function create(ctx: LedgerCtx): MockResult {
  const parsed = parseBill(ctx, ctx.req.body);
  if ('error' in parsed) return parsed.error;
  return ok({ data: billDto(newBill(ctx, parsed.fields)) }, 201);
}

function update(ctx: LedgerCtx, bill: StoredBill): MockResult {
  const body = ctx.req.body;
  const merged = { ...bill, ...body, lines: 'lines' in body ? body['lines'] : inputsOf(bill.lines) } as Record<string, unknown>;
  const parsed = parseBill(ctx, merged);
  if ('error' in parsed) return parsed.error;
  Object.assign(bill, parsed.fields);
  if (bill.bearer !== 'client_reimbursable') {
    delete bill.clientId;
    delete bill.clientName;
  }
  bill.history.push(docEvent(ctx, 'updated'));
  return ok({ data: billDto(bill) });
}

function actionOn(ctx: LedgerCtx, bill: StoredBill | undefined, action: string): MockResult {
  const permission = { submit: 'bills.create', cancel: 'bills.create', approve: 'bills.approve', reject: 'bills.approve', rebill: 'invoices.create' }[action];
  if (!permission) return fail(404, 'notFound');
  const denied = need(ctx.user, permission);
  if (denied) return denied;
  if (!bill) return fail(404, 'notFound');
  switch (action) {
    case 'submit':
      if (bill.status !== 'draft') return fail(409, 'conflict');
      if (!isPositive(bill.total)) return invalid({ lines: ['amountInvalid'] });
      bill.status = 'pending_approval';
      bill.history.push(docEvent(ctx, 'submitted'));
      return ok({ data: billDto(bill) });
    case 'cancel':
      if (bill.status !== 'draft' && bill.status !== 'pending_approval') return fail(409, 'docImmutable');
      bill.status = 'cancelled';
      bill.history.push(docEvent(ctx, 'cancelled', text(ctx.req.body['reason']) || undefined));
      return ok({ data: billDto(bill) });
    case 'reject': {
      if (bill.status !== 'pending_approval') return fail(409, 'conflict');
      const reason = text(ctx.req.body['reason']);
      if (!reason) return invalid({ reason: ['required'] });
      bill.status = 'draft';
      bill.history.push(docEvent(ctx, 'rejected', reason));
      return ok({ data: billDto(bill) });
    }
    case 'approve':
      return approve(ctx, bill);
    default:
      return rebill(ctx, bill);
  }
}

/** Journal lines of an approved bill: firm bills debit their expense accounts and input VAT, reimbursable ones the receivable from the client. */
function approvalLines(ctx: LedgerCtx, bill: StoredBill): { lines: Array<[string, string, string]> } | { error: MockResult } {
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const reimbursable = bill.bearer === 'client_reimbursable';
  const needs: Need[] = ['apControl'];
  if (reimbursable) needs.push('receivableFromClient');
  else {
    for (const l of bill.lines) needs.push({ category: l.categoryId as string });
    if (isPositive(bill.taxTotal)) needs.push('vatInput');
  }
  const missing = requireMappings(m, needs);
  if (missing) return { error: missing };
  const lines: Array<[string, string, string]> = [[m.apControl as string, '0', bill.total]];
  if (reimbursable) lines.push([m.receivableFromClient as string, bill.total, '0']);
  else {
    for (const l of bill.lines) lines.push([m.expenseByCategory[l.categoryId as string], l.net, '0']);
    if (isPositive(bill.taxTotal)) lines.push([m.vatInput as string, bill.taxTotal, '0']);
  }
  return { lines };
}

function approve(ctx: LedgerCtx, bill: StoredBill): MockResult {
  if (bill.status !== 'pending_approval') return fail(409, 'conflict');
  if (bill.createdBy === ctx.user.profile.id) return fail(403, 'fourEyesDoc');
  if (!withinApprovalLimit(ctx.user, 'bill', bill.total)) return fail(403, 'approvalLimit');
  const rebuilt = buildLines(ctx, 'ap', inputsOf(bill.lines), bill.date);
  if (isError(rebuilt)) return rebuilt.error;
  const totals = totalsOf(rebuilt.lines);
  if (!isPositive(totals.total)) return invalid({ lines: ['amountInvalid'] });
  const candidate: StoredBill = { ...bill, lines: rebuilt.lines, ...totals };
  const built = approvalLines(ctx, candidate);
  if ('error' in built) return built.error;
  const blocked = canPost(ctx, bill.date, built.lines);
  if (blocked) return blocked;
  const number = ctx.store.commercial.nextNumber(ctx.entity.id, 'bill', yearLabel(ctx, bill.date), 'BILL');
  const posted = postSystemJournal(ctx, { date: bill.date, description: `Supplier bill ${number} - ${bill.partyName}`, lines: built.lines, sourceType: 'supplier_bill', sourceId: bill.id, approvedBy: ctx.user.profile.id });
  if ('error' in posted) return posted.error;
  Object.assign(candidate, { number, reference: number, status: 'approved', balance: candidate.total, approvedBy: ctx.user.profile.id });
  candidate.journals = [linkOf(posted.journal, 'bill')];
  candidate.history = [...candidate.history, docEvent(ctx, 'approved', text(ctx.req.body['comment']) || number)];
  Object.assign(bill, candidate);
  return ok({ data: billDto(bill) });
}

/** Adds a client-reimbursable bill to a draft invoice of the customer linked to that client (a new draft when none is given). */
function rebill(ctx: LedgerCtx, bill: StoredBill): MockResult {
  const c = ctx.store.commercial;
  if (bill.rebilledInvoiceId) return fail(409, 'alreadyRebilled');
  if (bill.bearer !== 'client_reimbursable' || !bill.clientId || !bill.number || !ctx.clients.find(bill.clientId, ctx.user)) return invalid({ bill: ['rebillInvalid'] });
  const customer = c.parties.find((p) => p.ledgerEntityId === ctx.entity.id && p.kind === 'customer' && p.clientId === bill.clientId && !p.archived);
  if (!customer) return invalid({ bill: ['rebillInvalid'] });
  const service = c.serviceTypes.find((s) => s.ledgerEntityId === ctx.entity.id && s.kind === 'reimbursement');
  const m = c.mappingsOf(ctx.entity.id);
  if (!service || !m.revenueByService[service.id]) return invalid({ mappings: ['mappingMissing:reimbursement' as never] });
  const line = { description: `Reimbursement of ${bill.reference} (${bill.partyName})`, serviceTypeId: service.id, qty: '1', unitPrice: bill.total, discount: '0' };
  const target = text(ctx.req.body['invoiceId']) ? c.invoice(ctx.entity.id, ctx.req.body['invoiceId']) : undefined;
  if (text(ctx.req.body['invoiceId']) && (!target || target.status !== 'draft' || target.partyId !== customer.id)) return invalid({ invoiceId: ['invalidChoice'] });
  const date = target?.date ?? mockToday();
  const built = buildLines(ctx, 'ar', [...(target ? inputsOf(target.lines) : []), line], date);
  if (isError(built)) return built.error;
  let invoice = target;
  if (!invoice) {
    const terms = parseTerms({ termsKind: 'custom', termsDays: customer.paymentTermsDays }, date);
    if ('error' in terms) return terms.error;
    invoice = {
      id: c.nextId('inv'),
      ledgerEntityId: ctx.entity.id,
      reference: c.newDraftRef('INV'),
      partyId: customer.id,
      partyName: customer.name,
      date,
      dueDate: terms.dueDate,
      termsKind: terms.termsKind,
      termsDays: terms.termsDays,
      lines: [],
      net: '0',
      taxTotal: '0',
      total: '0',
      usesUnverifiedRate: false,
      status: 'draft',
      paid: '0',
      credited: '0',
      balance: '0',
      currency: 'EGP',
      requiresApproval: false,
      journals: [],
      schedule: [],
      reminders: [],
      revenueEvents: [],
      sourceBillId: bill.id,
      createdBy: ctx.user.profile.id,
      createdByName: ctx.user.profile.name,
      history: [docEvent(ctx, 'created', bill.reference)],
    };
    c.invoices.push(invoice);
  }
  Object.assign(invoice, { lines: built.lines, ...totalsOf(built.lines), usesUnverifiedRate: built.usesUnverified, requiresApproval: invoiceNeedsApproval(totalsOf(built.lines).total) });
  invoice.history.push(docEvent(ctx, 'rebilled', bill.reference));
  bill.rebilledInvoiceId = invoice.id;
  bill.history.push(docEvent(ctx, 'rebilled', invoice.reference));
  return ok({ data: { bill: billDto(bill), invoiceId: invoice.id } });
}

// ---- Employee expense claims -------------------------------------------------------------------------------

const CLAIM_RULES: Rules = { date: { kind: 'date', required: true }, description: { kind: 'text', required: true }, categoryId: { kind: 'text', required: true }, bearer: { kind: ['firm', 'client_reimbursable'] } };

/** A receipt is kept as a reference only (name, size, type); it must pass the same type and size rules as any upload. */
function receiptOf(raw: unknown): ExpenseClaim['receipt'] | null {
  const r = raw as Record<string, unknown> | null;
  const name = text(r?.['name']);
  const size = r?.['size'];
  const type = text(r?.['type']);
  const kind = ALLOWED_KINDS[extensionOf(name)];
  if (!name || !kind || !kind.mimes.includes(type) || typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_FILE_BYTES) return null;
  return { name, size, type };
}

const claimDto = (claim: StoredClaim): ExpenseClaim => structuredClone(claim);

export function handleClaims(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  const mine = store.commercial.claims.filter((x) => x.ledgerEntityId === entity.id);
  const approver = user.profile.permissions.includes('bills.approve');
  if (!id) {
    if (req.method === 'GET') {
      const denied = need(user, approver ? 'bills.approve' : 'expenses.claim');
      if (denied) return denied;
      const rows = mine.filter((x) => approver || x.claimantId === user.profile.id).filter((x) => !req.query.get('status') || x.status === req.query.get('status')).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      return paged(rows.map(claimDto), pageQuery(req.query));
    }
    return req.method === 'POST' ? (need(user, 'expenses.claim') ?? createClaim(ctx)) : fail(405, 'notFound');
  }
  const claim = mine.find((x) => x.id === id);
  const visible = claim && (approver || claim.claimantId === user.profile.id);
  if (req.method === 'GET' && !action) return need(user, approver ? 'bills.approve' : 'expenses.claim') ?? (visible ? ok({ data: claimDto(claim) }) : fail(404, 'notFound'));
  if (req.method !== 'POST' || !action) return fail(404, 'notFound');
  const permission = { approve: 'bills.approve', reject: 'bills.approve', pay: 'payments.record' }[action];
  if (!permission) return fail(404, 'notFound');
  const denied = need(user, permission);
  if (denied) return denied;
  if (!claim) return fail(404, 'notFound');
  return action === 'approve' ? approveClaim(ctx, claim) : action === 'reject' ? rejectClaim(ctx, claim) : payClaim(ctx, claim);
}

function createClaim(ctx: LedgerCtx): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, CLAIM_RULES, false);
  const amount = text(body['amount']);
  if (!isValidAmount(amount) || !isPositive(amount)) errors['amount'] = ['amountInvalid'];
  const c = ctx.store.commercial;
  if (!errors['categoryId'] && !c.category(ctx.entity.id, body['categoryId'])) errors['categoryId'] = ['invalidChoice'];
  const receipt = receiptOf(body['receipt']);
  if (!receipt) errors['receipt'] = ['receiptInvalid'];
  const bearer = (text(body['bearer']) || 'firm') as ExpenseClaim['bearer'];
  const clientId = text(body['clientId']);
  const problem = bearerProblem(ctx, bearer, clientId);
  if (problem && !errors['bearer']) Object.assign(errors, { bearer: ['bearerInvalid'] });
  if (Object.keys(errors).length || !receipt) return invalid(errors);
  const date = text(body['date']);
  const claim: StoredClaim = {
    id: c.nextId('ec'),
    ledgerEntityId: ctx.entity.id,
    reference: c.nextNumber(ctx.entity.id, 'expense_claim', yearLabel(ctx, date), 'EXP'),
    claimantId: ctx.user.profile.id,
    claimantName: ctx.user.profile.name,
    date,
    description: text(body['description']),
    categoryId: text(body['categoryId']),
    amount: normalize(amount),
    bearer,
    ...(bearer === 'client_reimbursable' ? { clientId } : {}),
    receipt,
    status: 'submitted',
    journals: [],
    history: [docEvent(ctx, 'submitted')],
  };
  c.claims.push(claim);
  return ok({ data: claimDto(claim) }, 201);
}

function approveClaim(ctx: LedgerCtx, claim: StoredClaim): MockResult {
  if (claim.status !== 'submitted') return fail(409, 'conflict');
  if (claim.claimantId === ctx.user.profile.id) return fail(403, 'fourEyesDoc');
  if (!withinApprovalLimit(ctx.user, 'expense_claim', claim.amount)) return fail(403, 'approvalLimit');
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const reimbursable = claim.bearer === 'client_reimbursable';
  const missing = requireMappings(m, ['employeePayable', reimbursable ? 'receivableFromClient' : { category: claim.categoryId }]);
  if (missing) return missing;
  const debit = reimbursable ? (m.receivableFromClient as string) : m.expenseByCategory[claim.categoryId];
  const lines: Array<[string, string, string]> = [[debit, claim.amount, '0'], [m.employeePayable as string, '0', claim.amount]];
  const blocked = canPost(ctx, claim.date, lines);
  if (blocked) return blocked;
  const posted = postSystemJournal(ctx, { date: claim.date, description: `Expense claim ${claim.reference} - ${claim.claimantName}`, lines, sourceType: 'expense_claim', sourceId: claim.id, approvedBy: ctx.user.profile.id });
  if ('error' in posted) return posted.error;
  claim.status = 'approved';
  claim.decidedBy = ctx.user.profile.name;
  claim.journals.push(linkOf(posted.journal, 'claim'));
  claim.history.push(docEvent(ctx, 'approved', text(ctx.req.body['comment']) || undefined));
  return ok({ data: claimDto(claim) });
}

function rejectClaim(ctx: LedgerCtx, claim: StoredClaim): MockResult {
  if (claim.status !== 'submitted') return fail(409, 'conflict');
  const reason = text(ctx.req.body['reason']);
  if (!reason) return invalid({ reason: ['required'] });
  claim.status = 'rejected';
  claim.decidedBy = ctx.user.profile.name;
  claim.decisionNote = reason;
  claim.history.push(docEvent(ctx, 'rejected', reason));
  return ok({ data: claimDto(claim) });
}

function payClaim(ctx: LedgerCtx, claim: StoredClaim): MockResult {
  if (claim.status !== 'approved') return fail(409, 'conflict');
  const m = ctx.store.commercial.mappingsOf(ctx.entity.id);
  const accountId = text(ctx.req.body['accountId']);
  const date = text(ctx.req.body['date']) || mockToday();
  if (!m.paymentAccounts.includes(accountId)) return invalid({ accountId: ['paymentAccountInvalid'] });
  const missing = requireMappings(m, ['employeePayable']);
  if (missing) return missing;
  const lines: Array<[string, string, string]> = [[m.employeePayable as string, claim.amount, '0'], [accountId, '0', claim.amount]];
  const blocked = canPost(ctx, date, lines);
  if (blocked) return blocked;
  const posted = postSystemJournal(ctx, { date, description: `Reimbursement of expense claim ${claim.reference}`, lines, sourceType: 'expense_claim_payment', sourceId: claim.id });
  if ('error' in posted) return posted.error;
  claim.status = 'paid';
  claim.journals.push(linkOf(posted.journal, 'claim_payment'));
  claim.history.push(docEvent(ctx, 'paid'));
  return ok({ data: claimDto(claim) });
}

