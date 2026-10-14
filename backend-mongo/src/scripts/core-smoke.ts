// Acceptance test for the ERP core: field merge, DocType metadata, customize API and DocType search.
import assert from 'node:assert/strict';
import { isValidFieldname, mergeFields, type FieldDef } from '../core/fields.js';

// ---- pure: field names and merge ----------------------------------------------------------------------------------------
for (const ok of ['reason_2', 'a', 'x'.repeat(64)]) assert.equal(isValidFieldname(ok), true, ok);
for (const bad of ['Reason', 'a b', 'a.b', '$x', '', 'x'.repeat(65), '1a', null, 5]) assert.equal(isValidFieldname(bad), false, String(bad));

const f = (fieldname: string, extra: Partial<FieldDef> = {}): FieldDef => ({ fieldname, label: fieldname, fieldtype: 'text', ...extra });
assert.deepEqual(mergeFields([f('a'), f('b'), f('c')], [f('x', { insertAfter: 'a' })]).map((x) => x.fieldname), ['a', 'x', 'b', 'c']);
assert.deepEqual(mergeFields([f('a'), f('b')], [f('x', { insertAfter: 'nope' })]).map((x) => x.fieldname), ['a', 'b', 'x']);
assert.deepEqual(mergeFields([f('a'), f('b')], [f('x', { insertAfter: 'a' }), f('y', { insertAfter: 'x' })]).map((x) => x.fieldname), ['a', 'x', 'y', 'b']);
assert.throws(() => mergeFields([f('a')], [f('a')]), /duplicate fieldname: a/);
assert.equal(mergeFields([f('a')], [f('h', { hidden: true })])[1].hidden, true);

console.log('core-smoke: pure checks passed');
