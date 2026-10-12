import { ExpenseCategory, MAPPING_KEYS, RECOGNITIONS, ServiceType, TAX_APPROVALS, TaxRate, TaxRateVersion } from '../../features/commercial/commercial.models';
import { isValidAmount, isValidPercent, normalize } from '../money/money';
import { mockToday } from './mock-clock';
import { Rules, pick, validate } from './mock-clients-rules';
import { CommercialStore } from './mock-commercial-store';
import { LedgerCtx } from './mock-ledger-store';
import { MockRequest, MockResult, clean, fail, invalid, need, ok } from './mock-types';
import { DemoUser } from './mock-users';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Anyone who works with commercial documents may read the reference data (rates, mappings, types, categories). */
export const READ_REFERENCE = ['invoices.view', 'invoices.create', 'bills.view', 'bills.create', 'payments.record', 'expenses.claim', 'suppliers.manage', 'mappings.manage', 'tax.rates.manage'];

export function needAny(user: DemoUser, permissions: readonly string[]): MockResult | null {
  return permissions.some((p) => user.profile.permissions.includes(p)) ? null : fail(403, 'forbidden');
}

const TAX_RULES: Rules = {
  code: { kind: 'text', required: true },
  name: { kind: 'text', required: true },
  rate: { kind: 'text', required: true },
  effectiveFrom: { kind: 'date', required: true },
  effectiveTo: { kind: 'date' },
  legalSource: { kind: 'text', required: true },
  approvalStatus: { kind: TAX_APPROVALS, required: true },
  lastVerifiedAt: { kind: 'date' },
};

/** Tax rates are global and versioned. Editing the rate or its dates adds a version; issued documents keep their snapshot. */
export function handleTaxRates(store: CommercialStore, req: MockRequest, user: DemoUser, id: string | undefined): MockResult {
  if (req.method === 'GET' && !id) return needAny(user, READ_REFERENCE) ?? ok({ data: structuredClone(store.taxRates) });
  const denied = need(user, 'tax.rates.manage');
  if (denied) return denied;
  if (req.method === 'POST' && !id) return createRate(store, req, user);
  const rate = store.taxRates.find((r) => r.id === id);
  if (!rate) return fail(404, 'notFound');
  return req.method === 'PATCH' ? updateRate(store, req, user, rate) : fail(405, 'notFound');
}

function rateErrors(body: Record<string, unknown>, partial: boolean, current?: TaxRate) {
  const errors = validate(body, TAX_RULES, partial);
  if (typeof body['rate'] === 'string' && !errors['rate'] && !isValidPercent(body['rate'].trim())) errors['rate'] = ['taxRateInvalid'];
  const from = text(body['effectiveFrom']) || current?.effectiveFrom || '';
  const to = 'effectiveTo' in body ? text(body['effectiveTo']) : (current?.effectiveTo ?? '');
  if (to && from && to < from && !errors['effectiveTo']) errors['effectiveTo'] = ['invalidDate'];
  const status = text(body['approvalStatus']) || current?.approvalStatus;
  const verified = 'lastVerifiedAt' in body ? text(body['lastVerifiedAt']) : (current?.lastVerifiedAt ?? '');
  if (status === 'professionally_verified' && !verified && !errors['lastVerifiedAt']) errors['lastVerifiedAt'] = ['required'];
  return errors;
}

function createRate(store: CommercialStore, req: MockRequest, user: DemoUser): MockResult {
  const body = req.body;
  const errors = rateErrors(body, false);
  if (!errors['code'] && store.taxRates.some((r) => r.code.toLowerCase() === text(body['code']).toLowerCase())) errors['code'] = ['duplicateCode'];
  if (Object.keys(errors).length) return invalid(errors);
  const rate: TaxRate = {
    id: store.nextId('tx'),
    code: text(body['code']),
    name: text(body['name']),
    rate: text(body['rate']),
    effectiveFrom: text(body['effectiveFrom']),
    ...(text(body['effectiveTo']) ? { effectiveTo: text(body['effectiveTo']) } : {}),
    jurisdiction: 'EG',
    legalSource: text(body['legalSource']),
    approvalStatus: body['approvalStatus'] as TaxRate['approvalStatus'],
    ...(text(body['lastVerifiedAt']) ? { lastVerifiedAt: text(body['lastVerifiedAt']) } : {}),
    version: 1,
    history: [],
    isDemo: false,
  };
  store.taxRates.push(rate);
  return ok({ data: structuredClone(rate) }, 201);
}

function updateRate(store: CommercialStore, req: MockRequest, user: DemoUser, rate: TaxRate): MockResult {
  const body = req.body;
  const errors = rateErrors(body, true, rate);
  if ('code' in body && !errors['code'] && store.taxRates.some((r) => r !== rate && r.code.toLowerCase() === text(body['code']).toLowerCase())) errors['code'] = ['duplicateCode'];
  if (Object.keys(errors).length) return invalid(errors);
  const next = { ...rate, ...clean(pick(body, TAX_RULES) as Partial<TaxRate>) } as TaxRate;
  if ('effectiveTo' in body && !text(body['effectiveTo'])) delete next.effectiveTo;
  const changed = next.rate !== rate.rate || next.effectiveFrom !== rate.effectiveFrom || next.effectiveTo !== rate.effectiveTo || next.approvalStatus !== rate.approvalStatus;
  if (changed) {
    const previous: TaxRateVersion = { version: rate.version, rate: rate.rate, effectiveFrom: rate.effectiveFrom, ...(rate.effectiveTo ? { effectiveTo: rate.effectiveTo } : {}), approvalStatus: rate.approvalStatus, changedAt: new Date().toISOString(), changedBy: user.profile.name };
    next.history = [...rate.history, previous];
    next.version = rate.version + 1;
  }
  Object.assign(rate, next);
  return ok({ data: structuredClone(rate) });
}

/** Account mappings of one ledger: which accounts documents post to. Writes need mappings.manage. */
export function handleMappings(ctx: LedgerCtx): MockResult {
  const { req, user, store, entity } = ctx;
  const commercial = store.commercial;
  if (req.method === 'GET') return needAny(user, READ_REFERENCE) ?? ok({ data: structuredClone(commercial.mappingsOf(entity.id)) });
  if (req.method !== 'PUT' && req.method !== 'PATCH') return fail(405, 'notFound');
  const denied = need(user, 'mappings.manage');
  if (denied) return denied;
  const body = req.body;
  const usable = (id: unknown): boolean => {
    const a = store.account(entity.id, id);
    return !!a && a.isPostable && a.isActive;
  };
  const errors: Record<string, ['mappingInvalid']> = {};
  const next = structuredClone(commercial.mappingsOf(entity.id));
  for (const key of MAPPING_KEYS) {
    if (!(key in body)) continue;
    const value = text(body[key]);
    if (!value) delete next[key];
    else if (usable(value)) next[key] = value;
    else errors[key] = ['mappingInvalid'];
  }
  for (const [field, owners] of [['revenueByService', commercial.serviceTypes], ['expenseByCategory', commercial.categories]] as const) {
    if (!(field in body)) continue;
    const given = body[field];
    if (!given || typeof given !== 'object') {
      errors[field] = ['mappingInvalid'];
      continue;
    }
    const merged: Record<string, string> = {};
    for (const [owner, account] of Object.entries(given as Record<string, unknown>)) {
      if (!owners.some((o) => o.ledgerEntityId === entity.id && o.id === owner)) continue;
      if (text(account) === '') continue;
      if (usable(account)) merged[owner] = text(account);
      else errors[`${field}.${owner}`] = ['mappingInvalid'];
    }
    next[field] = merged;
  }
  if ('paymentAccounts' in body) {
    const ids = body['paymentAccounts'];
    if (Array.isArray(ids) && ids.every((id) => usable(id))) next.paymentAccounts = [...new Set(ids as string[])];
    else errors['paymentAccounts'] = ['mappingInvalid'];
  }
  if (Object.keys(errors).length) return invalid(errors);
  commercial.mappings.set(entity.id, next);
  return ok({ data: structuredClone(next) });
}

export function handleSettings(ctx: LedgerCtx): MockResult {
  const { req, user, store, entity } = ctx;
  if (req.method === 'GET') return needAny(user, READ_REFERENCE) ?? ok({ data: { ...store.commercial.settingsOf(entity.id), today: mockToday() } });
  if (req.method !== 'PATCH') return fail(405, 'notFound');
  const denied = need(user, 'mappings.manage');
  if (denied) return denied;
  if (typeof req.body['allowDraftRates'] !== 'boolean') return invalid({ allowDraftRates: ['invalidChoice'] });
  store.commercial.settingsOf(entity.id).allowDraftRates = req.body['allowDraftRates'];
  return ok({ data: { ...store.commercial.settingsOf(entity.id), today: mockToday() } });
}

const SERVICE_RULES: Rules = {
  code: { kind: 'text', required: true },
  nameAr: { kind: 'text', required: true },
  nameEn: { kind: 'text', required: true },
  recognition: { kind: RECOGNITIONS, required: true },
  kind: { kind: ['standard', 'reimbursement'] },
};
const CATEGORY_RULES: Rules = {
  code: { kind: 'text', required: true },
  nameAr: { kind: 'text', required: true },
  nameEn: { kind: 'text', required: true },
  monthlyBudget: { kind: 'text' },
};

type Catalogue = 'service-types' | 'expense-categories';

/** Service types (with their revenue recognition policy) and expense categories (with a monthly budget). */
export function handleCatalogue(ctx: LedgerCtx, which: Catalogue, rest: string[]): MockResult {
  const { req, user, store, entity } = ctx;
  const commercial = store.commercial;
  const list = (which === 'service-types' ? commercial.serviceTypes : commercial.categories) as Array<ServiceType | ExpenseCategory>;
  const rules = which === 'service-types' ? SERVICE_RULES : CATEGORY_RULES;
  const [id] = rest;
  if (req.method === 'GET' && !id) return needAny(user, READ_REFERENCE) ?? ok({ data: structuredClone(list.filter((x) => x.ledgerEntityId === entity.id)) });
  const denied = need(user, 'mappings.manage');
  if (denied) return denied;
  const partial = req.method === 'PATCH';
  const existing = id ? list.find((x) => x.ledgerEntityId === entity.id && x.id === id) : undefined;
  if ((req.method === 'PATCH' && !existing) || (req.method !== 'POST' && req.method !== 'PATCH')) return fail(req.method === 'PATCH' ? 404 : 405, 'notFound');
  const body = req.body;
  const errors = validate(body, rules, partial);
  if ('code' in body && !errors['code'] && list.some((x) => x.ledgerEntityId === entity.id && x !== existing && x.code.toLowerCase() === text(body['code']).toLowerCase())) errors['code'] = ['duplicateCode'];
  const budget = text(body['monthlyBudget']);
  if (budget && !isValidAmount(budget)) errors['monthlyBudget'] = ['invalidDecimal'];
  if (Object.keys(errors).length) return invalid(errors);
  const fields = clean(pick(body, rules) as Record<string, unknown>);
  if (existing) {
    Object.assign(existing, fields);
    if ('monthlyBudget' in body && !budget) delete (existing as ExpenseCategory).monthlyBudget;
    else if (budget) (existing as ExpenseCategory).monthlyBudget = normalize(budget);
    return ok({ data: structuredClone(existing) });
  }
  const created = (
    which === 'service-types'
      ? { id: commercial.nextId('st'), ledgerEntityId: entity.id, kind: 'standard', ...fields }
      : { id: commercial.nextId('ec'), ledgerEntityId: entity.id, ...fields, ...(budget ? { monthlyBudget: normalize(budget) } : {}) }
  ) as ServiceType & ExpenseCategory;
  list.push(created);
  return ok({ data: structuredClone(created) }, 201);
}
