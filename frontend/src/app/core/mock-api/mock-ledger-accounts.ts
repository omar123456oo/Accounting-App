import { Account, ACCOUNT_CATEGORIES } from '../../features/accounting/accounting.models';
import { Rules, validate } from './mock-clients-rules';
import { NORMAL_BY_CATEGORY } from './mock-ledger-template';
import { LedgerCtx, StoredAccount } from './mock-ledger-store';
import { MockResult, clean, fail, invalid, need, ok } from './mock-types';

const RULES: Rules = {
  code: { kind: 'text', required: true },
  nameAr: { kind: 'text', required: true },
  nameEn: { kind: 'text', required: true },
  category: { kind: ACCOUNT_CATEGORIES, required: true },
  normalBalance: { kind: ['debit', 'credit'] },
  isPostable: { kind: 'bool' },
  isActive: { kind: 'bool' },
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function dto(ctx: LedgerCtx, a: StoredAccount): Account {
  return { ...a, hasPostings: ctx.store.hasPostings(a.id) };
}

/** Chart of accounts of one ledger. Reads need ledger.view, changes need ledger.manage_accounts. */
export function handleAccounts(ctx: LedgerCtx, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const [id, action] = rest;
  if (!id) {
    if (req.method === 'GET') return need(user, 'ledger.view') ?? ok({ data: store.accountsOf(entity.id).sort((a, b) => a.code.localeCompare(b.code)).map((a) => dto(ctx, a)) });
    return req.method === 'POST' ? (need(user, 'ledger.manage_accounts') ?? create(ctx)) : fail(405, 'notFound');
  }
  if (id === 'import-template' && req.method === 'POST') return need(user, 'ledger.manage_accounts') ?? importTemplate(ctx);
  const denied = need(user, req.method === 'GET' ? 'ledger.view' : 'ledger.manage_accounts');
  if (denied) return denied;
  const account = store.account(entity.id, id);
  if (!account || action) return fail(404, 'notFound');
  if (req.method === 'GET') return ok({ data: dto(ctx, account) });
  return req.method === 'PATCH' ? update(ctx, account) : fail(405, 'notFound');
}

function importTemplate(ctx: LedgerCtx): MockResult {
  const created = ctx.store.importStarterChart(ctx.entity.id);
  return ok({ data: created.map((a) => dto(ctx, a)), meta: { created: created.length } }, 201);
}

/** The parent must be a non-postable group of the same category in this ledger, and not one of the account's own descendants. */
function parentProblem(ctx: LedgerCtx, parentId: string, category: string, selfId?: string) {
  const parent = ctx.store.account(ctx.entity.id, parentId);
  if (!parent || parent.isPostable || parent.category !== category || ctx.store.hasPostings(parent.id)) return true;
  for (let p: StoredAccount | undefined = parent; p; p = p.parentId ? ctx.store.account(ctx.entity.id, p.parentId) : undefined) {
    if (p.id === selfId) return true;
  }
  return false;
}

function create(ctx: LedgerCtx): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, RULES, false);
  const code = text(body['code']);
  if (code && ctx.store.accountByCode(ctx.entity.id, code)) errors['code'] = ['duplicateCode'];
  const parentId = text(body['parentId']);
  if (parentId && !errors['category'] && parentProblem(ctx, parentId, body['category'] as string)) errors['parentId'] = ['invalidParent'];
  if (Object.keys(errors).length) return invalid(errors);
  const category = body['category'] as StoredAccount['category'];
  const account: StoredAccount = clean({
    id: ctx.store.nextId('a'),
    ledgerEntityId: ctx.entity.id,
    code,
    nameAr: text(body['nameAr']),
    nameEn: text(body['nameEn']),
    category,
    parentId: parentId || undefined,
    isPostable: body['isPostable'] !== false,
    isActive: true,
    normalBalance: (body['normalBalance'] as StoredAccount['normalBalance'] | undefined) ?? NORMAL_BY_CATEGORY[category],
  });
  ctx.store.accounts.push(account);
  return ok({ data: dto(ctx, account) }, 201);
}

function update(ctx: LedgerCtx, account: StoredAccount): MockResult {
  const body = ctx.req.body;
  const errors = validate(body, RULES, true);
  if (Object.keys(errors).length) return invalid(errors);
  const category = (body['category'] as StoredAccount['category'] | undefined) ?? account.category;
  // State conflicts first. Structural changes are blocked once posted lines exist: they would rewrite history.
  if (ctx.store.hasPostings(account.id) && (category !== account.category || body['isActive'] === false || body['isPostable'] === false)) return fail(409, 'accountHasPostings');
  const children = ctx.store.accountsOf(ctx.entity.id).filter((a) => a.parentId === account.id);
  if ((body['isActive'] === false && children.some((a) => a.isActive)) || (body['isPostable'] === true && children.length > 0)) return fail(409, 'accountHasChildren');
  const code = 'code' in body ? text(body['code']) : account.code;
  if (code !== account.code && ctx.store.accountByCode(ctx.entity.id, code)) errors['code'] = ['duplicateCode'];
  const parentId = 'parentId' in body ? text(body['parentId']) : (account.parentId ?? '');
  if (parentId && ('parentId' in body || category !== account.category) && parentProblem(ctx, parentId, category, account.id)) errors['parentId'] = ['invalidParent'];
  if (Object.keys(errors).length) return invalid(errors);
  const categoryChanged = category !== account.category;
  Object.assign(account, clean({ code, category, parentId: parentId || undefined }));
  if (!parentId) delete account.parentId;
  for (const f of ['nameAr', 'nameEn'] as const) if (f in body) account[f] = text(body[f]);
  for (const f of ['isPostable', 'isActive', 'normalBalance'] as const) if (f in body) Object.assign(account, { [f]: body[f] });
  if (categoryChanged && !('normalBalance' in body)) account.normalBalance = NORMAL_BY_CATEGORY[category];
  return ok({ data: dto(ctx, account) });
}
