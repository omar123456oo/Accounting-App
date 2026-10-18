import { Types } from 'mongoose';
import { FIELD_ROLES, FIELD_TYPES, type DocFieldDef, type FieldRole } from './models.js';
import { normalizeBoolean, normalizeCurrency, normalizeDate, normalizeNationalId, normalizeNumber } from './normalize.js';

export const FIELD_KEY = /^[a-z][a-z0-9_]{0,47}$/;
export const isFieldKey = (v: unknown): v is string => typeof v === 'string' && FIELD_KEY.test(v);

export interface Coerced { value: unknown; issues: string[] }

/** One raw value into the shape its field type stores. A value that does not fit is dropped with an issue; it is never repaired by guessing. */
export function coerce(def: DocFieldDef, raw: unknown): Coerced {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return { value: null, issues: [] };
  const bad = (m: string): Coerced => ({ value: null, issues: [m] });
  switch (def.type) {
    case 'text': case 'textarea': {
      const s = String(raw).trim();
      if (def.format === 'national_id') { const id = normalizeNationalId(s); return id ? { value: id, issues: [] } : bad('Not a valid 14-digit national ID.'); }
      return { value: s.slice(0, def.type === 'textarea' ? 5000 : 500), issues: [] };
    }
    case 'number': { const n = normalizeNumber(raw); return n === null ? bad('Not a number.') : { value: n, issues: [] }; }
    case 'date': { const d = normalizeDate(raw); return d ? { value: d, issues: [] } : bad('Not a valid date.'); }
    case 'checkbox': { const b = normalizeBoolean(raw); return b === null ? bad('Not yes or no.') : { value: b, issues: [] }; }
    case 'currency': {
      const m = normalizeCurrency(raw);
      return m ? { value: m, issues: m.currency ? [] : ['Currency not stated.'] } : bad('Not an amount.');
    }
    case 'select': {
      const s = String(raw).trim();
      const hit = def.options.find((o) => o.toLowerCase() === s.toLowerCase());
      return hit ? { value: hit, issues: [] } : bad('Not one of the allowed options.');
    }
    case 'reference': {
      const s = String(raw);
      return /^[0-9a-f]{24}$/i.test(s) ? { value: s, issues: [] } : bad('Not a valid reference.');
    }
  }
}

/** Checks a whole set of approved values against the active fields. Required fields must be present. Date order is enforced. */
export function validateValues(fields: DocFieldDef[], values: Record<string, unknown>): { clean: Record<string, unknown>; errors: Record<string, string[]> } {
  const clean: Record<string, unknown> = {};
  const errors: Record<string, string[]> = {};
  for (const f of fields.filter((x) => x.active)) {
    const { value, issues } = coerce(f, values[f.key]);
    if (issues.length && value === null && values[f.key] !== null && values[f.key] !== undefined && values[f.key] !== '') errors[f.key] = issues;
    else if (value === null) { if (f.required) errors[f.key] = ['Required.']; }
    else clean[f.key] = value;
  }
  const byRole = (r: FieldRole) => fields.find((f) => f.active && f.role === r);
  const pair = (a: FieldRole, b: FieldRole, msg: string) => {
    const fa = byRole(a); const fb = byRole(b);
    if (fa && fb && typeof clean[fa.key] === 'string' && typeof clean[fb.key] === 'string' && (clean[fa.key] as string) > (clean[fb.key] as string)) (errors[fb.key] ??= []).push(msg);
  };
  pair('issue_date', 'expiry_date', 'The expiry date is before the issue date.');
  pair('start_date', 'end_date', 'The end date is before the start date.');
  return { clean, errors };
}

/** Dates lifted through field roles, for querying. */
export function derivedDates(fields: DocFieldDef[], values: Record<string, unknown>): { expiryDate?: string; startDate?: string; endDate?: string; renewalDate?: string } {
  const pick = (role: FieldRole): string | undefined => {
    const f = fields.find((x) => x.active && x.role === role);
    const v = f ? values[f.key] : undefined;
    return typeof v === 'string' ? v : undefined;
  };
  return { expiryDate: pick('expiry_date') ?? pick('end_date'), startDate: pick('start_date'), endDate: pick('end_date'), renewalDate: pick('renewal_date') };
}

/** Validates an administrator's field list. Returns messages by key path. */
export function validateFieldDefs(list: unknown): { fields: DocFieldDef[]; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const add = (k: string, m: string) => (errors[k] ??= []).push(m);
  const fields: DocFieldDef[] = [];
  if (!Array.isArray(list)) { add('fields', 'Send a list of fields.'); return { fields, errors }; }
  if (list.length > 80) add('fields', 'At most 80 fields.');
  const seen = new Set<string>();
  list.slice(0, 80).forEach((x: any, i) => {
    const at = `fields.${i}`;
    if (!isFieldKey(x?.key)) return add(`${at}.key`, 'Use lower-case letters, digits and underscores, starting with a letter (48 characters at most).');
    if (seen.has(x.key)) return add(`${at}.key`, 'This key is used twice.');
    seen.add(x.key);
    if (typeof x.label !== 'string' || !x.label.trim()) add(`${at}.label`, 'Required.');
    if (!(FIELD_TYPES as readonly string[]).includes(x.type)) return add(`${at}.type`, 'Unknown field type.');
    if (x.role !== undefined && x.role !== null && !(FIELD_ROLES as readonly string[]).includes(x.role)) add(`${at}.role`, 'Unknown role.');
    const dateRoles = ['issue_date', 'expiry_date', 'start_date', 'end_date', 'renewal_date'];
    if (x.role && dateRoles.includes(x.role) && x.type !== 'date') add(`${at}.role`, 'Date roles need a date field.');
    if (x.type === 'select' && (!Array.isArray(x.options) || x.options.length === 0)) add(`${at}.options`, 'List the allowed options.');
    if (x.type === 'reference' && !['employee', 'department', 'user'].includes(x.referenceKind)) add(`${at}.referenceKind`, 'Choose what it refers to.');
    fields.push({
      key: x.key, label: String(x.label ?? '').trim().slice(0, 120), labelAr: typeof x.labelAr === 'string' ? x.labelAr.trim().slice(0, 120) : undefined,
      type: x.type, required: x.required === true, active: x.active !== false, order: Number.isFinite(x.order) ? Number(x.order) : i,
      options: Array.isArray(x.options) ? x.options.filter((o: unknown) => typeof o === 'string' && o.trim()).map((o: string) => o.trim().slice(0, 100)).slice(0, 100) : [],
      sensitive: x.sensitive === true, role: x.role || undefined, referenceKind: x.referenceKind || undefined,
      aiHint: typeof x.aiHint === 'string' ? x.aiHint.trim().slice(0, 300) : undefined, format: x.format === 'national_id' ? 'national_id' : undefined,
    });
  });
  const roleSeen = new Set<string>();
  fields.forEach((f, i) => { if (f.role && f.active) { if (roleSeen.has(f.role)) add(`fields.${i}.role`, 'Another active field already has this role.'); roleSeen.add(f.role); } });
  fields.sort((a, b) => a.order - b.order).forEach((f, i) => { f.order = i; });
  return { fields, errors };
}

export const isObjectId = (v: unknown): v is string => typeof v === 'string' && Types.ObjectId.isValid(v) && /^[0-9a-f]{24}$/i.test(v);
