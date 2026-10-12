import { Party } from '../../features/commercial/commercial.models';
import { isPositive, normalize, sum } from '../money/money';
import { Rules, pick, validate } from './mock-clients-rules';
import { isOpen } from './mock-commercial-calc';
import { StoredParty } from './mock-commercial-store';
import { needAny } from './mock-commercial-settings';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail, invalid, ok } from './mock-types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const RULES: Rules = {
  name: { kind: 'text', required: true },
  email: { kind: 'email' },
  phone: { kind: 'text' },
  taxRegistrationNo: { kind: 'digits' },
  archived: { kind: 'bool' },
};

const VIEW: Record<Party['kind'], string[]> = {
  customer: ['invoices.view', 'invoices.create', 'payments.record'],
  supplier: ['bills.view', 'bills.create', 'payments.record', 'suppliers.manage'],
};
const MANAGE: Record<Party['kind'], string> = { customer: 'invoices.create', supplier: 'suppliers.manage' };

export function partyDto(ctx: LedgerCtx, p: StoredParty): Party {
  const c = ctx.store.commercial;
  const open = p.kind === 'customer' ? c.invoices.filter((i) => i.partyId === p.id && isOpen(i.status)) : c.bills.filter((b) => b.partyId === p.id && isOpen(b.status));
  const credit = c.payments.filter((x) => x.partyId === p.id).map((x) => x.unapplied);
  return {
    ...p,
    ...(p.clientId ? { clientName: ctx.clients.clientName(p.clientId) } : {}),
    openBalance: normalize(sum(open.map((d) => d.balance))),
    creditBalance: normalize(sum(credit)),
  };
}

/** Customers and suppliers of one ledger. A customer of the firm ledger may be linked to one of the caller's clients. */
export function handleParties(ctx: LedgerCtx, kind: Party['kind'], rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const parties = store.commercial.parties;
  const [id, action] = rest;
  const mine = parties.filter((p) => p.ledgerEntityId === entity.id && p.kind === kind);
  if (!id) {
    if (req.method === 'GET') {
      const term = (req.query.get('q') ?? '').trim().toLowerCase();
      const withArchived = req.query.get('archived') === 'true';
      return needAny(user, VIEW[kind]) ?? ok({ data: mine.filter((p) => (withArchived || !p.archived) && (!term || p.name.toLowerCase().includes(term))).sort((a, b) => a.name.localeCompare(b.name)).map((p) => partyDto(ctx, p)) });
    }
    return req.method === 'POST' ? (needManage(ctx, kind) ?? create(ctx, kind)) : fail(405, 'notFound');
  }
  const party = mine.find((p) => p.id === id);
  if (req.method === 'GET' && !action) return needAny(user, VIEW[kind]) ?? (party ? ok({ data: partyDto(ctx, party) }) : fail(404, 'notFound'));
  const denied = needManage(ctx, kind);
  if (denied) return denied;
  if (!party) return fail(404, 'notFound');
  return req.method === 'PATCH' && !action ? update(ctx, kind, party) : fail(405, 'notFound');
}

function needManage(ctx: LedgerCtx, kind: Party['kind']): MockResult | null {
  return ctx.user.profile.permissions.includes(MANAGE[kind]) ? null : fail(403, 'forbidden');
}

function parse(ctx: LedgerCtx, kind: Party['kind'], partial: boolean): { fields: Partial<StoredParty> } | { error: MockResult } {
  const body = ctx.req.body;
  const errors = validate(body, RULES, partial);
  const terms = body['paymentTermsDays'];
  if (terms !== undefined && terms !== '' && !(Number.isInteger(terms) && (terms as number) >= 0 && (terms as number) <= 365)) errors['paymentTermsDays'] = ['invalidNumber'];
  const clientId = text(body['clientId']);
  if (clientId && (kind !== 'customer' || ctx.entity.type !== 'firm' || !ctx.clients.find(clientId, ctx.user))) errors['clientId'] = ['invalidChoice'];
  if (Object.keys(errors).length) return { error: invalid(errors) };
  const fields = pick(body, RULES) as Partial<StoredParty>;
  if ('clientId' in body) fields.clientId = clientId || undefined;
  if (typeof terms === 'number') fields.paymentTermsDays = terms;
  return { fields };
}

function create(ctx: LedgerCtx, kind: Party['kind']): MockResult {
  const parsed = parse(ctx, kind, false);
  if ('error' in parsed) return parsed.error;
  const party: StoredParty = { id: ctx.store.commercial.nextId(kind === 'customer' ? 'cu' : 'su'), ledgerEntityId: ctx.entity.id, kind, name: '', paymentTermsDays: 30, archived: false, ...parsed.fields };
  if (!party.clientId) delete party.clientId;
  ctx.store.commercial.parties.push(party);
  return ok({ data: partyDto(ctx, party) }, 201);
}

function update(ctx: LedgerCtx, kind: Party['kind'], party: StoredParty): MockResult {
  const parsed = parse(ctx, kind, true);
  if ('error' in parsed) return parsed.error;
  if (parsed.fields.archived === true) {
    const open = partyDto(ctx, party);
    if (isPositive(open.openBalance) || isPositive(open.creditBalance)) return fail(409, 'conflict');
  }
  Object.assign(party, parsed.fields);
  if (!party.clientId) delete party.clientId;
  return ok({ data: partyDto(ctx, party) });
}
