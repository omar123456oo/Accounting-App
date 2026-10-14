import { TAX_APPROVALS } from '../../features/commercial/commercial.models';
import { CalendarRule, OBLIGATION_KINDS, ObligationType, RECURRENCES, RuleMeta, RuleSet, TaxSettings } from '../../features/tax/tax.models';
import { isValidPercent } from '../money/money';
import { Rules, validate } from './mock-clients-rules';
import { ComplianceStore } from './mock-compliance-store';
import { MockRequest, MockResult, fail, invalid, need, ok } from './mock-types';
import { DemoUser } from './mock-users';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const META: Rules = {
  legalSource: { kind: 'text', required: true },
  effectiveFrom: { kind: 'date', required: true },
  effectiveTo: { kind: 'date' },
  approvalStatus: { kind: TAX_APPROVALS, required: true },
  lastVerifiedAt: { kind: 'date' },
};
const TYPE_RULES: Rules = { code: { kind: 'text', required: true }, nameAr: { kind: 'text', required: true }, nameEn: { kind: 'text', required: true }, kind: { kind: OBLIGATION_KINDS, required: true } };
const CALENDAR_RULES: Rules = { ...META, obligationTypeId: { kind: 'text', required: true }, recurrence: { kind: RECURRENCES, required: true }, dueDayOffset: { kind: 'digits', required: true } };
const RULESET_RULES: Rules = { ...META, code: { kind: 'text', required: true }, name: { kind: 'text', required: true }, kind: { kind: ['income_tax_rate', 'other'], required: true }, percent: { kind: 'text', required: true } };

export const isUnverified = (m: Pick<RuleMeta, 'approvalStatus' | 'isDemo'>): boolean => m.isDemo || m.approvalStatus !== 'professionally_verified';

export function settingsView(c: ComplianceStore): TaxSettings {
  return {
    obligationTypes: structuredClone(c.obligationTypes),
    calendarRules: structuredClone(c.calendarRules),
    ruleSets: structuredClone(c.ruleSets),
    unverified: [...c.calendarRules, ...c.ruleSets].some(isUnverified) || c.calendarRules.length + c.ruleSets.length === 0,
  };
}

/** Dates and verification: a rule is "professionally verified" only with the date of that verification. */
function metaErrors(body: Record<string, unknown>, partial: boolean, current?: RuleMeta) {
  const errors = validate(body, partial ? Object.fromEntries(Object.entries(META)) : META, partial);
  const from = text(body['effectiveFrom']) || current?.effectiveFrom || '';
  const to = 'effectiveTo' in body ? text(body['effectiveTo']) : (current?.effectiveTo ?? '');
  if (to && from && to < from && !errors['effectiveTo']) errors['effectiveTo'] = ['invalidDate'];
  const status = text(body['approvalStatus']) || current?.approvalStatus;
  const verified = 'lastVerifiedAt' in body ? text(body['lastVerifiedAt']) : (current?.lastVerifiedAt ?? '');
  if (status === 'professionally_verified' && !verified && !errors['lastVerifiedAt']) errors['lastVerifiedAt'] = ['required'];
  return errors;
}

const metaOf = (body: Record<string, unknown>): Omit<RuleMeta, 'version' | 'isDemo'> => ({
  legalSource: text(body['legalSource']),
  effectiveFrom: text(body['effectiveFrom']),
  ...(text(body['effectiveTo']) ? { effectiveTo: text(body['effectiveTo']) } : {}),
  approvalStatus: body['approvalStatus'] as RuleMeta['approvalStatus'],
  ...(text(body['lastVerifiedAt']) ? { lastVerifiedAt: text(body['lastVerifiedAt']) } : {}),
});

/** Applies a PATCH to a rule: the version moves up whenever anything that decides a result changes. */
function patchMeta(target: RuleMeta, body: Record<string, unknown>, valueFields: string[]): void {
  let changed = false;
  for (const f of ['effectiveFrom', 'legalSource', 'approvalStatus', 'lastVerifiedAt', ...valueFields]) {
    if (!(f in body)) continue;
    const next = f === 'dueDayOffset' ? Number(body[f]) : text(body[f]);
    if ((target as unknown as Record<string, unknown>)[f] !== next) {
      Object.assign(target, { [f]: next });
      changed = true;
    }
  }
  if ('effectiveTo' in body) {
    const to = text(body['effectiveTo']);
    if (to !== (target.effectiveTo ?? '')) {
      if (to) target.effectiveTo = to;
      else delete target.effectiveTo;
      changed = true;
    }
  }
  if (changed) target.version += 1;
}

/**
 * Obligation types, filing-calendar rules and versioned rule sets. They are DATA: the mock only ships clearly
 * marked demo values and every rule shows its legal source, effective dates and verification status.
 * Reading needs tax.view; changing anything needs tax.settings.
 */
export function handleTaxSettings(c: ComplianceStore, req: MockRequest, user: DemoUser, section: string | undefined, id: string | undefined): MockResult {
  if (req.method === 'GET' && !section) return need(user, 'tax.view') ?? ok({ data: settingsView(c) });
  const denied = need(user, 'tax.settings');
  if (denied) return denied;
  const record = (action: string, entityType: string, entityId: string, after: unknown): void => c.audit.record({ actorId: user.profile.id, actorName: user.profile.name, action, entityType, entityId, after });
  switch (section) {
    case 'obligation-types':
      return obligationTypes(c, req, id, record);
    case 'calendar-rules':
      return calendarRules(c, req, id, record);
    case 'rule-sets':
      return ruleSets(c, req, id, record);
    default:
      return fail(404, 'notFound');
  }
}

type Record_ = (action: string, entityType: string, entityId: string, after: unknown) => void;

function obligationTypes(c: ComplianceStore, req: MockRequest, id: string | undefined, record: Record_): MockResult {
  const body = req.body;
  if (req.method === 'POST' && !id) {
    const errors = validate(body, TYPE_RULES, false);
    if (!errors['code'] && c.obligationTypes.some((t) => t.code.toLowerCase() === text(body['code']).toLowerCase())) errors['code'] = ['duplicateCode'];
    if (Object.keys(errors).length) return invalid(errors);
    const t: ObligationType = { id: c.nextId('ot'), code: text(body['code']), nameAr: text(body['nameAr']), nameEn: text(body['nameEn']), kind: body['kind'] as ObligationType['kind'], isDemo: false };
    c.obligationTypes.push(t);
    record('tax.obligation_type_created', 'obligation_type', t.id, t);
    return ok({ data: structuredClone(t) }, 201);
  }
  const t = c.obligationTypes.find((x) => x.id === id);
  if (!t) return fail(404, 'notFound');
  if (req.method !== 'PATCH') return fail(405, 'notFound');
  const errors = validate(body, TYPE_RULES, true);
  if (Object.keys(errors).length) return invalid(errors);
  for (const f of ['nameAr', 'nameEn'] as const) if (f in body) t[f] = text(body[f]);
  if ('kind' in body) t.kind = body['kind'] as ObligationType['kind'];
  record('tax.obligation_type_updated', 'obligation_type', t.id, t);
  return ok({ data: structuredClone(t) });
}

function calendarRules(c: ComplianceStore, req: MockRequest, id: string | undefined, record: Record_): MockResult {
  const body = req.body;
  const partial = req.method === 'PATCH';
  if (req.method === 'POST' && !id) {
    const errors = { ...validate(body, CALENDAR_RULES, false), ...metaErrors(body, false) };
    if (!errors['obligationTypeId'] && !c.obligationTypes.some((t) => t.id === body['obligationTypeId'])) errors['obligationTypeId'] = ['invalidChoice'];
    if (Object.keys(errors).length) return invalid(errors);
    const rule: CalendarRule = { id: c.nextId('cr'), obligationTypeId: text(body['obligationTypeId']), recurrence: body['recurrence'] as CalendarRule['recurrence'], dueDayOffset: Number(body['dueDayOffset']), ...metaOf(body), version: 1, isDemo: false };
    c.calendarRules.push(rule);
    record('tax.calendar_rule_created', 'calendar_rule', rule.id, rule);
    return ok({ data: structuredClone(rule) }, 201);
  }
  const rule = c.calendarRules.find((x) => x.id === id);
  if (!rule) return fail(404, 'notFound');
  if (!partial) return fail(405, 'notFound');
  const errors = { ...validate(body, CALENDAR_RULES, true), ...metaErrors(body, true, rule) };
  if (Object.keys(errors).length) return invalid(errors);
  if ('recurrence' in body && body['recurrence'] !== rule.recurrence) {
    rule.recurrence = body['recurrence'] as CalendarRule['recurrence'];
    rule.version += 1;
  }
  patchMeta(rule, body, ['dueDayOffset']);
  record('tax.calendar_rule_updated', 'calendar_rule', rule.id, rule);
  return ok({ data: structuredClone(rule) });
}

function ruleSets(c: ComplianceStore, req: MockRequest, id: string | undefined, record: Record_): MockResult {
  const body = req.body;
  const check = (partial: boolean, current?: RuleSet) => {
    const errors = { ...validate(body, RULESET_RULES, partial), ...metaErrors(body, partial, current) };
    if (typeof body['percent'] === 'string' && !errors['percent'] && !isValidPercent(body['percent'].trim())) errors['percent'] = ['taxRateInvalid'];
    return errors;
  };
  if (req.method === 'POST' && !id) {
    const errors = check(false);
    if (!errors['code'] && c.ruleSets.some((r) => r.code.toLowerCase() === text(body['code']).toLowerCase() && r.effectiveFrom === text(body['effectiveFrom']))) errors['code'] = ['duplicateCode'];
    if (Object.keys(errors).length) return invalid(errors);
    const rule: RuleSet = { id: c.nextId('rs'), code: text(body['code']), name: text(body['name']), kind: body['kind'] as RuleSet['kind'], percent: text(body['percent']), ...metaOf(body), version: 1, isDemo: false };
    c.ruleSets.push(rule);
    record('tax.rule_set_created', 'rule_set', rule.id, rule);
    return ok({ data: structuredClone(rule) }, 201);
  }
  const rule = c.ruleSets.find((x) => x.id === id);
  if (!rule) return fail(404, 'notFound');
  if (req.method !== 'PATCH') return fail(405, 'notFound');
  const errors = check(true, rule);
  if (Object.keys(errors).length) return invalid(errors);
  if ('name' in body) rule.name = text(body['name']);
  patchMeta(rule, body, ['percent']);
  record('tax.rule_set_updated', 'rule_set', rule.id, rule);
  return ok({ data: structuredClone(rule) });
}
