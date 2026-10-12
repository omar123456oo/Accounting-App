import { AGREEMENT_STATUSES, CLIENT_STATUSES, LEGAL_FORMS, NOTE_TYPES } from '../../features/clients/client.models';
import { MockMessageKey } from './mock-messages';

export type Kind = 'text' | 'email' | 'digits' | 'decimal' | 'date' | 'bool' | 'month' | 'currency' | 'ids' | readonly string[];
export interface Rule {
  kind: Kind;
  required?: boolean;
}
export type Rules = Record<string, Rule>;
export type FieldErrors = Record<string, MockMessageKey[]>;

/**
 * Tax and commercial registration numbers are only required to be non-empty digits here. This is NOT legal
 * validation: the real Egyptian tax ID and commercial registry rules need specialist confirmation.
 */
export const CLIENT_RULES: Rules = {
  legalName: { kind: 'text', required: true },
  tradeName: { kind: 'text' },
  legalForm: { kind: LEGAL_FORMS, required: true },
  commercialRegistrationNo: { kind: 'digits' },
  taxRegistrationNo: { kind: 'digits' },
  address: { kind: 'text', required: true },
  industry: { kind: 'text' },
  fiscalYearStartMonth: { kind: 'month', required: true },
  status: { kind: CLIENT_STATUSES },
  assignedAccountantIds: { kind: 'ids' },
};

export const SUB_RULES: Record<string, Rules> = {
  contacts: {
    name: { kind: 'text', required: true },
    role: { kind: 'text' },
    email: { kind: 'email', required: true },
    phone: { kind: 'text' },
    isAuthorizedRepresentative: { kind: 'bool' },
  },
  branches: { name: { kind: 'text', required: true }, address: { kind: 'text', required: true } },
  'bank-accounts': {
    bankName: { kind: 'text', required: true },
    accountNo: { kind: 'digits', required: true },
    iban: { kind: 'text' },
    currency: { kind: 'currency' },
  },
  agreements: {
    startDate: { kind: 'date', required: true },
    endDate: { kind: 'date', required: true },
    renewalDate: { kind: 'date', required: true },
    monthlyFee: { kind: 'decimal', required: true },
    status: { kind: AGREEMENT_STATUSES, required: true },
  },
  notes: {
    type: { kind: NOTE_TYPES, required: true },
    body: { kind: 'text', required: true },
    followUpDate: { kind: 'date' },
  },
};

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function validDate(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

function check(kind: Kind, v: unknown): MockMessageKey | null {
  if (Array.isArray(kind) || typeof kind !== 'string') {
    return (kind as readonly string[]).includes(v as string) ? null : 'invalidChoice';
  }
  switch (kind) {
    case 'text':
      return typeof v === 'string' ? null : 'required';
    case 'email':
      return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'invalidEmail';
    case 'digits':
      return typeof v === 'string' && /^\d+$/.test(v) ? null : 'digitsOnly';
    case 'decimal':
      // Money stays a string end to end; at most 2 decimals.
      return typeof v === 'string' && /^\d{1,13}(\.\d{1,2})?$/.test(v) ? null : 'invalidDecimal';
    case 'date':
      return validDate(v) ? null : 'invalidDate';
    case 'bool':
      return typeof v === 'boolean' ? null : 'invalidChoice';
    case 'month':
      return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12 ? null : 'invalidNumber';
    case 'currency':
      return typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? null : 'invalidChoice';
    case 'ids':
      return Array.isArray(v) && v.every((x) => typeof x === 'string') ? null : 'invalidChoice';
  }
}

/** Validates only the fields present when `partial`; otherwise required fields must be present too. */
export function validate(body: Record<string, unknown>, rules: Rules, partial: boolean): FieldErrors {
  const errors: FieldErrors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const value = body[field];
    if (partial && !(field in body)) continue;
    if (isEmpty(value)) {
      if (rule.required) errors[field] = ['required'];
      continue;
    }
    const problem = check(rule.kind, value);
    if (problem) errors[field] = [problem];
  }
  if ('startDate' in rules && !errors['endDate'] && !errors['startDate'] && typeof body['endDate'] === 'string' && typeof body['startDate'] === 'string' && body['endDate'] < body['startDate']) {
    errors['endDate'] = ['invalidDate'];
  }
  return errors;
}

/** Keeps only whitelisted keys, trimming strings; an empty string becomes undefined so optional fields can be cleared. */
export function pick(body: Record<string, unknown>, rules: Rules): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(rules)) {
    if (!(field in body)) continue;
    const v = body[field];
    if (typeof v === 'string') {
      out[field] = v.trim() === '' ? undefined : v.trim();
    } else if (v !== undefined && v !== null) {
      out[field] = v;
    }
  }
  return out;
}
