import { FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { DocField, ExtractedField, FieldValue, Money, ReviewDecision } from './smart-docs.models';

/** Fields of a type that a form shows: active ones, in the order the administrator set. */
export const activeFields = (fields: DocField[]): DocField[] => fields.filter((f) => f.active).sort((a, b) => a.order - b.order);

export const isMoney = (v: unknown): v is Money => !!v && typeof v === 'object' && 'amount' in (v as object);

const NATIONAL_ID = /^\d{14}$/;
const nationalId = (c: FormControl): ValidationErrors | null => (!c.value || NATIONAL_ID.test(String(c.value).replace(/[\s-]/g, '')) ? null : { nationalId: true });

/** One control per active field. A currency field is a group of amount and currency. */
export function buildForm(fields: DocField[], initial: Record<string, FieldValue> = {}): FormGroup {
  const group = new FormGroup({});
  for (const f of activeFields(fields)) {
    const v = initial[f.key] ?? null;
    if (f.type === 'currency') {
      const m = isMoney(v) ? v : { amount: null, currency: null };
      group.addControl(f.key, new FormGroup({ amount: new FormControl<number | null>(m.amount ?? null, f.required ? [Validators.required] : []), currency: new FormControl<string | null>(m.currency ?? null) }));
    } else if (f.type === 'checkbox') {
      group.addControl(f.key, new FormControl<boolean | null>(typeof v === 'boolean' ? v : null));
    } else {
      // Validators go in the constructor: adding them afterwards would not run until the value next changed.
      const validators = [...(f.required ? [Validators.required] : []), ...(f.format === 'national_id' ? [nationalId as never] : [])];
      group.addControl(f.key, new FormControl<string | number | null>(typeof v === 'string' || typeof v === 'number' ? v : null, validators));
    }
  }
  return group;
}

/** The value a form holds for one field, in the shape the API stores. An empty field is null. */
export function readValue(f: DocField, raw: unknown): FieldValue {
  if (f.type === 'currency') {
    const m = raw as { amount: number | string | null; currency: string | null } | null;
    const n = m?.amount === null || m?.amount === undefined || m.amount === '' ? null : Number(m.amount);
    return n === null || Number.isNaN(n) ? null : { amount: n, currency: m?.currency || null };
  }
  if (f.type === 'number') { if (raw === null || raw === undefined || raw === '') return null; const n = Number(raw); return Number.isNaN(n) ? null : n; }
  if (f.type === 'checkbox') return typeof raw === 'boolean' ? raw : null;
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

export function readForm(fields: DocField[], form: FormGroup): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of activeFields(fields)) out[f.key] = readValue(f, form.get(f.key)?.value);
  return out;
}

export const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
export const confidenceOf = (c: number | undefined): Confidence => (c === undefined ? 'unknown' : c >= 0.85 ? 'high' : c >= 0.6 ? 'medium' : 'low');

/**
 * A proposed value must be checked by a person. It is flagged for extra care when the provider was unsure, said so itself,
 * or when the value could not be understood at all.
 */
export function needsVerification(e: ExtractedField | undefined): boolean {
  if (!e || e.state === 'not_found') return false;
  return e.state === 'invalid' || e.issues.length > 0 || confidenceOf(e.confidence) === 'low' || confidenceOf(e.confidence) === 'unknown';
}

export type FieldState = 'pending' | 'accepted' | 'rejected' | 'edited';

/**
 * The starting values of the review form. A saved draft wins, then what the extraction proposed, then values already approved.
 * Nothing is ever taken from an AI result into the approved record by this function: the person still has to approve.
 */
export function startingValues(fields: DocField[], extracted: ExtractedField[], draft: Record<string, ReviewDecision>, approved: Record<string, FieldValue>): { values: Record<string, FieldValue>; states: Record<string, FieldState> } {
  const values: Record<string, FieldValue> = {};
  const states: Record<string, FieldState> = {};
  for (const f of activeFields(fields)) {
    const d = draft[f.key]; const e = extracted.find((x) => x.key === f.key);
    if (d) { values[f.key] = d.decision === 'rejected' ? null : (d.value ?? null); states[f.key] = d.decision; continue; }
    if (e && e.state === 'extracted' && !e.masked) { values[f.key] = (e.normalizedValue ?? null) as FieldValue; states[f.key] = 'pending'; continue; }
    values[f.key] = approved[f.key] ?? null; states[f.key] = 'pending';
  }
  return { values, states };
}

/** What to save as the draft: only fields the person acted on. */
export function draftFrom(fields: DocField[], current: Record<string, FieldValue>, states: Record<string, FieldState>): Record<string, ReviewDecision> {
  const out: Record<string, ReviewDecision> = {};
  for (const f of activeFields(fields)) {
    const s = states[f.key];
    if (s && s !== 'pending') out[f.key] = { decision: s, ...(s === 'rejected' ? {} : { value: current[f.key] ?? null }) };
  }
  return out;
}
