import { DocField, ExtractedField } from './smart-docs.models';
import { activeFields, buildForm, confidenceOf, draftFrom, needsVerification, readForm, sameValue, startingValues } from './form-model';

const f = (key: string, type: DocField['type'], extra: Partial<DocField> = {}): DocField => ({ key, label: key, labelAr: null, type, required: false, active: true, order: 0, options: [], sensitive: false, role: null, referenceKind: null, aiHint: null, format: null, ...extra });
const FIELDS: DocField[] = [f('title', 'text', { required: true, order: 0 }), f('end_date', 'date', { order: 1 }), f('amount', 'currency', { order: 2 }), f('signed', 'checkbox', { order: 3 }), f('hidden', 'text', { active: false, order: 4 }), f('nid', 'text', { format: 'national_id', order: 5 })];
const ext = (key: string, extra: Partial<ExtractedField> = {}): ExtractedField => ({ key, state: 'extracted', issues: [], confidence: 0.95, ...extra });

describe('smart document form model', () => {
  it('shows only active fields, in the administrator order', () => {
    expect(activeFields([f('b', 'text', { order: 2 }), f('a', 'text', { order: 1 }), f('c', 'text', { active: false })]).map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('builds a control per active field and enforces required and national ID rules', () => {
    const form = buildForm(FIELDS);
    expect(Object.keys(form.controls)).toEqual(['title', 'end_date', 'amount', 'signed', 'nid']);
    expect(form.valid).toBe(false);
    form.get('title')!.setValue('Contract');
    expect(form.valid).toBe(true);
    form.get('nid')!.setValue('123');
    expect(form.get('nid')!.errors).toEqual({ nationalId: true });
    form.get('nid')!.setValue('290 0101 0112345');
    expect(form.get('nid')!.valid).toBe(true);
  });

  it('reads values in the shape the API stores, with empty fields as null', () => {
    const form = buildForm(FIELDS, { title: ' Nile ', amount: { amount: 12500, currency: 'EGP' } });
    form.get('end_date')!.setValue('2026-11-01');
    form.get('nid')!.setValue('');
    expect(readForm(FIELDS, form)).toEqual({ title: 'Nile', end_date: '2026-11-01', amount: { amount: 12500, currency: 'EGP' }, signed: null, nid: null });
  });

  it('treats a currency without an amount as empty', () => {
    const form = buildForm(FIELDS);
    form.get('amount')!.get('currency')!.setValue('EGP');
    expect(readForm(FIELDS, form)['amount']).toBeNull();
  });

  it('puts a saved draft first, then the proposal, then approved values; a rejected field is empty', () => {
    const { values, states } = startingValues(
      FIELDS,
      [ext('title', { normalizedValue: 'AI title' }), ext('end_date', { normalizedValue: '2026-11-01' }), ext('nid', { state: 'not_found' })],
      { title: { decision: 'edited', value: 'My title' }, end_date: { decision: 'rejected' } },
      { nid: '29001010112345', signed: true },
    );
    expect(values).toEqual({ title: 'My title', end_date: null, amount: null, signed: true, nid: '29001010112345' });
    expect(states).toMatchObject({ title: 'edited', end_date: 'rejected', amount: 'pending' });
  });

  it('never takes a value from a masked (sensitive) field of an extraction', () => {
    const { values } = startingValues(FIELDS, [ext('nid', { masked: true, normalizedValue: 'x' })], {}, {});
    expect(values['nid']).toBeNull();
  });

  it('saves only the fields a person acted on', () => {
    const draft = draftFrom(FIELDS, { title: 'T', end_date: '2026-01-01', amount: null, signed: null, nid: null }, { title: 'accepted', end_date: 'rejected', amount: 'pending', signed: 'pending', nid: 'pending' });
    expect(draft).toEqual({ title: { decision: 'accepted', value: 'T' }, end_date: { decision: 'rejected' } });
  });

  it('flags values that need extra checking', () => {
    expect(needsVerification(ext('a'))).toBe(false);
    expect(needsVerification(ext('a', { confidence: 0.4 }))).toBe(true);
    expect(needsVerification(ext('a', { confidence: undefined }))).toBe(true);
    expect(needsVerification(ext('a', { issues: ['Day and month could be read either way.'] }))).toBe(true);
    expect(needsVerification(ext('a', { state: 'invalid' }))).toBe(true);
    expect(needsVerification(ext('a', { state: 'not_found' }))).toBe(false);
    expect(needsVerification(undefined)).toBe(false);
    expect([confidenceOf(0.9), confidenceOf(0.7), confidenceOf(0.2), confidenceOf(undefined)]).toEqual(['high', 'medium', 'low', 'unknown']);
  });

  it('compares values structurally', () => {
    expect(sameValue({ amount: 1, currency: 'EGP' }, { amount: 1, currency: 'EGP' })).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue('a', 'b')).toBe(false);
  });
});
