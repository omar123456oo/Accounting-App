import { FieldDef } from './core.models';
import { buildGroup, toPayload, visibleFields } from './record-form-model';

const f = (fieldname: string, fieldtype: FieldDef['fieldtype'], extra: Partial<FieldDef> = {}): FieldDef => ({ fieldname, label: fieldname, fieldtype, ...extra });
const FIELDS: FieldDef[] = [
  f('tag', 'text', { required: true }), f('price', 'currency'), f('count', 'number'), f('bought', 'date'),
  f('status', 'select', { options: ['new', 'used'] }), f('active', 'checkbox'), f('parent', 'link', { options: ['asset'] }), f('secret', 'text', { hidden: true }),
];

describe('record form model', () => {
  it('starts every type from an empty value and fills from existing data', () => {
    const empty = buildGroup(FIELDS, {});
    expect(empty.getRawValue()).toEqual({ tag: '', price: null, count: null, bought: '', status: '', active: false, parent: '' });
    const filled = buildGroup(FIELDS, { tag: 'A-1', price: 12.5, active: true, status: 'new', secret: 'kept' });
    expect(filled.getRawValue()).toMatchObject({ tag: 'A-1', price: 12.5, active: true, status: 'new' });
  });

  it('does not render hidden fields', () => {
    expect(visibleFields(FIELDS).map((x) => x.fieldname)).not.toContain('secret');
    expect(buildGroup(FIELDS, {}).contains('secret')).toBe(false);
  });

  it('marks required fields invalid until filled, ignoring spaces', () => {
    const g = buildGroup(FIELDS, {});
    expect(g.controls['tag'].invalid).toBe(true);
    g.controls['tag'].setValue('   ');
    expect(g.controls['tag'].invalid).toBe(true);
    g.controls['tag'].setValue('x');
    expect(g.valid).toBe(true);
  });

  it('sends null for blank optional values so an update can clear them, and never sends hidden fields', () => {
    const g = buildGroup(FIELDS, { tag: ' A ', price: 3, status: 'used' });
    g.controls['price'].setValue(null);
    g.controls['status'].setValue('');
    expect(toPayload(FIELDS, g.getRawValue())).toEqual({ tag: 'A', price: null, count: null, bought: null, status: null, active: false, parent: null });
  });

  it('keeps zero and false as real values', () => {
    const g = buildGroup(FIELDS, { tag: 'a', count: 0, price: 0, active: false });
    const p = toPayload(FIELDS, g.getRawValue());
    expect(p['count']).toBe(0);
    expect(p['price']).toBe(0);
    expect(p['active']).toBe(false);
  });
});
