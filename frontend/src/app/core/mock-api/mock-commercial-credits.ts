import { CreditNote, Side } from '../../features/commercial/commercial.models';
import { Rules, validate } from './mock-clients-rules';
import { applyCredit, isOpen, settle, splitCredit, yearLabel } from './mock-commercial-calc';
import { docEvent, invoiceDto } from './mock-commercial-invoices';
import { billDto } from './mock-commercial-bills';
import { canPost, linkOf, postSystemJournal, Need, requireMappings } from './mock-commercial-posting';
import { StoredBill, StoredInvoice } from './mock-commercial-store';
import { add, cmp, isPositive, isValidAmount, normalize, sum } from '../money/money';
import { mockToday } from './mock-clock';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, need, ok, pageQuery, paged } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const RULES: Rules = { docId: { kind: 'text', required: true }, reason: { kind: 'text', required: true }, date: { kind: 'date' } };
const PERMISSIONS: Record<Side, { view: string; create: string }> = { ar: { view: 'invoices.view', create: 'invoices.issue' }, ap: { view: 'bills.view', create: 'bills.approve' } };

/** Customer credit notes (`credit-notes`) and supplier credits (`supplier-credits`). */
export function handleCredits(ctx: LedgerCtx, side: Side, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const mine = store.commercial.creditNotes.filter((c) => c.ledgerEntityId === entity.id && c.side === side);
  const [id] = rest;
  if (req.method === 'GET') {
    const denied = need(user, PERMISSIONS[side].view);
    if (denied) return denied;
    if (id) {
      const found = mine.find((c) => c.id === id);
      return found ? ok({ data: structuredClone(found) }) : fail(404, 'notFound');
    }
    const rows = mine.filter((c) => !req.query.get('docId') || c.docId === req.query.get('docId')).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    return paged(structuredClone(rows), pageQuery(req.query));
  }
  if (req.method !== 'POST' || id) return fail(405, 'notFound');
  return need(user, PERMISSIONS[side].create) ?? create(ctx, side);
}

function create(ctx: LedgerCtx, side: Side): MockResult {
  const { store, entity, req } = ctx;
  const c = store.commercial;
  const body = req.body;
  const errors = validate(body, RULES, false);
  const amount = text(body['amount']);
  if (!isValidAmount(amount) || !isPositive(amount)) errors['amount'] = ['amountInvalid'];
  const doc: StoredInvoice | StoredBill | undefined = side === 'ar' ? c.invoice(entity.id, body['docId']) : c.bill(entity.id, body['docId']);
  if (!errors['docId'] && !doc) errors['docId'] = ['invalidChoice'];
  if (Object.keys(errors).length || !doc) return invalid(errors);
  if (!isOpen(doc.status)) return fail(409, 'conflict');
  if (cmp(amount, doc.balance) > 0) return invalid({ amount: ['creditExceedsBalance'] });
  if (side === 'ar' && (doc as StoredInvoice).schedule.length > 0) return invalid({ amount: ['creditAfterRecognition'] });
  const bill = side === 'ap' ? (doc as StoredBill) : undefined;
  if (bill?.rebilledInvoiceId) return fail(409, 'conflict');

  const m = c.mappingsOf(entity.id);
  const shares = splitCredit(doc.lines, amount);
  const reimbursable = bill?.bearer === 'client_reimbursable';
  const needs: Need[] = side === 'ar' ? ['arControl'] : ['apControl'];
  for (const s of shares) {
    const line = doc.lines[s.index];
    if (side === 'ar') needs.push(line.recognition === 'deferred_over_period' ? 'deferredRevenue' : { service: line.serviceTypeId as string });
    else needs.push(reimbursable ? 'receivableFromClient' : { category: line.categoryId as string });
  }
  if (isPositive(sum(shares.map((s) => s.tax)))) needs.push(side === 'ar' ? 'vatOutput' : 'vatInput');
  const missing = requireMappings(m, needs);
  if (missing) return missing;

  const date = text(body['date']) || mockToday();
  const lines: Array<[string, string, string]> = [];
  if (side === 'ar') {
    lines.push([m.arControl as string, '0', amount]);
    for (const s of shares) {
      const line = doc.lines[s.index];
      lines.push([line.recognition === 'deferred_over_period' ? (m.deferredRevenue as string) : m.revenueByService[line.serviceTypeId as string], s.net, '0']);
      lines.push([m.vatOutput ?? '', s.tax, '0']);
    }
  } else {
    lines.push([m.apControl as string, amount, '0']);
    for (const s of shares) {
      const line = doc.lines[s.index];
      lines.push([reimbursable ? (m.receivableFromClient as string) : m.expenseByCategory[line.categoryId as string], '0', reimbursable ? add(s.net, s.tax) : s.net]);
      if (!reimbursable) lines.push([m.vatInput ?? '', '0', s.tax]);
    }
  }
  const blocked = canPost(ctx, date, lines.filter(([a]) => a !== ''));
  if (blocked) return blocked;

  const number = c.nextNumber(entity.id, side === 'ar' ? 'credit_note' : 'supplier_credit', yearLabel(ctx, date), side === 'ar' ? 'CN' : 'SCN');
  const posted = postSystemJournal(ctx, {
    date,
    description: `${side === 'ar' ? 'Credit note' : 'Supplier credit'} ${number} against ${doc.reference}`,
    lines: lines.filter(([a]) => a !== ''),
    sourceType: side === 'ar' ? 'credit_note' : 'supplier_credit',
    sourceId: '',
  });
  if ('error' in posted) return posted.error;
  const note: CreditNote = {
    id: c.nextId('cn'),
    ledgerEntityId: entity.id,
    side,
    number,
    docId: doc.id,
    docReference: doc.reference,
    partyId: doc.partyId,
    partyName: doc.partyName,
    date,
    reason: text(body['reason']),
    amount: normalize(amount),
    lines: shares.map((s) => ({ description: doc.lines[s.index].description, net: s.net, tax: s.tax })),
    journalId: posted.journal.id,
    createdByName: ctx.user.profile.name,
  };
  posted.journal.sourceId = note.id;
  c.creditNotes.push(note);
  applyCredit(doc.lines, shares);
  doc.credited = normalize(add(doc.credited, amount));
  settle(doc, side === 'ar' ? 'issued' : 'approved');
  if (side === 'ar') {
    for (const s of shares) {
      const line = doc.lines[s.index];
      if (line.recognition !== 'deferred_over_period' && line.serviceTypeId) (doc as StoredInvoice).revenueEvents.push({ date, serviceTypeId: line.serviceTypeId, amount: normalize(`-${s.net}`) });
    }
  }
  doc.journals.push(linkOf(posted.journal, 'credit_note'));
  doc.history.push(docEvent(ctx, 'credit_note', number));
  return ok({ data: { creditNote: structuredClone(note), document: side === 'ar' ? invoiceDto(doc as StoredInvoice) : billDto(doc as StoredBill) } }, 201);
}
