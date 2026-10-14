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

// ---- database and HTTP ---------------------------------------------------------------------------------------------------
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const { CustomField, DocRecord } = await import('../core/models.js');
const { Organization, Role, User } = await import('../models/index.js');
const { hashPassword } = await import('../auth/password.js');
const { roleMatrix } = await import('../db/permissions.js');
const { verifyChain } = await import('../db/audit-chain.js');
const { AuditEvent } = await import('../models/audit-event.js');
await connectDb();
const { password, org } = await seed();
const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;

class Client {
  jar = new Map<string, string>();
  async call(method: string, path: string, body?: unknown) {
    const x = this.jar.get('XSRF-TOKEN');
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'accept-language': 'en', cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(x && { 'x-xsrf-token': x }) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }
  static async login(email: string, pw: string) {
    const c = new Client();
    await c.call('GET', '/sanctum/csrf-cookie');
    assert.equal((await c.call('POST', '/api/v1/auth/login', { email, password: pw })).status, 200, email);
    return c;
  }
  static as = (role: string) => Client.login(`demo.${role}@demo.test`, password);
}
const C = '/api/v1/staff/core';
const names = (r: { json: any }) => r.json.data.fields.map((x: any) => x.fieldname);

try {
  // model: unique custom field per org
  const orgA = new Types.ObjectId();
  const orgB = new Types.ObjectId();
  const row = (organizationId: Types.ObjectId) => ({ organizationId, doctype: 'x', fieldname: 'ticket_ref', label: 'Ticket', fieldtype: 'text' });
  await CustomField.create(row(orgA));
  await assert.rejects(CustomField.create(row(orgA)), (e: { code?: number }) => e.code === 11000);
  await CustomField.create(row(orgB));

  const owner = await Client.as('owner');
  const accountant = await Client.as('accountant');

  // a second organization with its own owner
  const other = await Organization.create({ name: 'Other Office' });
  await Role.create({ organizationId: other._id, name: 'owner', permissions: roleMatrix().owner });
  await User.create({ organizationId: other._id, name: 'o', email: 'owner@other.test', passwordHash: await hashPassword(password), type: 'staff', roles: ['owner'], emailVerifiedAt: new Date() });
  const outsider = await Client.login('owner@other.test', password);

  // meta: built-in fields
  const meta = await owner.call('GET', `${C}/meta/leave_request`);
  assert.equal(meta.status, 200);
  assert.deepEqual(names(meta), ['leave_type', 'from_date', 'to_date', 'reason']);
  assert.equal((await owner.call('GET', `${C}/meta/nope`)).status, 404);

  // customize: add a field after from_date
  const put = (c: Client, fields: unknown[], doctype = 'leave_request') => c.call('PUT', `${C}/customize/${doctype}`, { fields });
  const tf = { fieldname: 'ticket_ref', label: 'Ticket', fieldtype: 'text', insertAfter: 'from_date' };
  assert.equal((await put(owner, [tf])).status, 200);
  assert.deepEqual(names(await owner.call('GET', `${C}/meta/leave_request`)), ['leave_type', 'from_date', 'ticket_ref', 'to_date', 'reason']);
  assert.deepEqual((await owner.call('GET', `${C}/customize/leave_request`)).json.data.fields.map((x: any) => x.fieldname), ['ticket_ref']);

  // validation: collisions, bad names, bad types, select without options
  const bad = async (fields: unknown[]) => { const r = await put(owner, fields); assert.equal(r.status, 422, JSON.stringify(fields)); assert.ok(r.json.errors.fields, JSON.stringify(r.json)); };
  await bad([{ fieldname: 'reason', label: 'R', fieldtype: 'text' }]);
  await bad([{ fieldname: 'Bad Name', label: 'R', fieldtype: 'text' }]);
  await bad([{ fieldname: 'a.b', label: 'R', fieldtype: 'text' }]);
  await bad([{ fieldname: 'ok_name', label: 'R', fieldtype: 'bogus' }]);
  await bad([{ fieldname: 'ok_name', label: '', fieldtype: 'text' }]);
  await bad([{ fieldname: 'pick', label: 'Pick', fieldtype: 'select' }]);
  await bad([{ fieldname: 'dup', label: 'A', fieldtype: 'text' }, { fieldname: 'dup', label: 'B', fieldtype: 'text' }]);
  assert.deepEqual(names(await owner.call('GET', `${C}/meta/leave_request`)), ['leave_type', 'from_date', 'ticket_ref', 'to_date', 'reason'], 'failed PUTs change nothing');

  // permissions and tenant isolation
  assert.equal((await put(accountant, [tf])).status, 403);
  assert.equal((await accountant.call('GET', `${C}/meta/leave_request`)).status, 200);
  assert.deepEqual(names(await outsider.call('GET', `${C}/meta/leave_request`)), ['leave_type', 'from_date', 'to_date', 'reason']);

  // admin-made DocType
  const vehicle = { name: 'vehicle', label: 'Vehicle', module: 'operations', fields: [{ fieldname: 'plate', label: 'Plate', fieldtype: 'text', required: true }], titleField: 'plate', searchFields: ['plate'], viewPermission: 'clients.view' };
  assert.equal((await owner.call('POST', `${C}/doctypes`, vehicle)).status, 201);
  assert.equal((await owner.call('POST', `${C}/doctypes`, vehicle)).status, 422, 'duplicate name');
  assert.equal((await owner.call('POST', `${C}/doctypes`, { ...vehicle, name: 'leave_request' })).status, 422, 'built-in name');
  assert.equal((await owner.call('POST', `${C}/doctypes`, { ...vehicle, name: 'Bad Name' })).status, 422);
  assert.equal((await owner.call('POST', `${C}/doctypes`, { ...vehicle, name: 'v2', titleField: 'missing' })).status, 422, 'title field must exist');
  assert.equal((await accountant.call('POST', `${C}/doctypes`, { ...vehicle, name: 'v3' })).status, 403);
  assert.deepEqual(names(await owner.call('GET', `${C}/meta/vehicle`)), ['plate']);
  assert.equal((await outsider.call('GET', `${C}/meta/vehicle`)).status, 404);
  assert.equal((await put(owner, [{ fieldname: 'color', label: 'Colour', fieldtype: 'text' }], 'vehicle')).status, 200);
  assert.deepEqual(names(await owner.call('GET', `${C}/meta/vehicle`)), ['plate', 'color']);
  const list = (await owner.call('GET', `${C}/doctypes`)).json.data.map((d: any) => d.name);
  assert.ok(list.includes('vehicle') && list.includes('leave_request'));
  assert.equal((await put(owner, [], 'unknown_type')).status, 404);
  assert.equal((await owner.call('DELETE', `${C}/doctypes/vehicle`)).status, 204);
  assert.equal((await owner.call('GET', `${C}/meta/vehicle`)).status, 404);
  assert.equal(await CustomField.countDocuments({ organizationId: org._id, doctype: 'vehicle' }), 0);
  assert.equal((await owner.call('DELETE', `${C}/doctypes/leave_request`)).status, 404, 'built-ins cannot be deleted');

  // search over admin-made DocTypes
  assert.equal((await owner.call('POST', `${C}/doctypes`, vehicle)).status, 201);
  const rec = (name: string, plate: string) => DocRecord.create({ organizationId: org._id, doctype: 'vehicle', name, data: { plate } });
  await rec('VEH-1', 'ABC-123'); await rec('VEH-2', 'XYZ-999'); await rec('VEH-3', 'A.C-777');
  const s = async (c: Client, q: string, extra = '') => c.call('GET', `${C}/search?q=${encodeURIComponent(q)}${extra}`);
  const hit = (await s(owner, 'abc')).json.data;
  assert.equal(hit.length, 1);
  assert.deepEqual({ doctype: hit[0].doctype, name: hit[0].name, title: hit[0].title, doctypeLabel: hit[0].doctypeLabel }, { doctype: 'vehicle', name: 'VEH-1', title: 'ABC-123', doctypeLabel: 'Vehicle' });
  assert.equal(hit[0].route, '/app/records/vehicle/VEH-1');
  assert.equal((await s(owner, 'ab')).json.data.length, 1);
  assert.deepEqual((await s(owner, 'a.c')).json.data.map((h: any) => h.name), ['VEH-3'], 'dot is literal, not a wildcard');
  for (const q of ['(', '.*', '[', '\\', 'a(b']) { const r = await s(owner, q); assert.equal(r.status, 200, q); assert.deepEqual(r.json.data, [], q); }
  assert.deepEqual((await s(owner, 'a')).json.data, [], 'under two characters');
  assert.deepEqual((await s(owner, '')).json.data, []);
  assert.equal((await s(owner, 'abc', '&type=vehicle')).json.data.length, 1);
  assert.deepEqual((await s(owner, 'abc', '&type=leave_request')).json.data, []);
  assert.equal((await s(accountant, 'abc')).json.data.length, 1, 'accountant holds clients.view');
  assert.deepEqual((await s(outsider, 'abc')).json.data, [], 'other organization');
  // a type the caller may not view leaves no trace
  const secret = { ...vehicle, name: 'salary_note', label: 'Salary note', viewPermission: 'payroll.view' };
  assert.equal((await owner.call('POST', `${C}/doctypes`, secret)).status, 201);
  await DocRecord.create({ organizationId: org._id, doctype: 'salary_note', name: 'SN-1', data: { plate: 'ABC-SECRET' } });
  assert.equal((await s(owner, 'abc')).json.data.length, 2);
  assert.equal((await s(accountant, 'abc')).json.data.length, 1);
  assert.equal((await s(accountant, 'abc', '&type=salary_note')).json.data.length, 0);

  // audit
  assert.ok(await AuditEvent.exists({ organizationId: org._id, action: 'customize.update' }));
  assert.ok(await AuditEvent.exists({ organizationId: org._id, action: 'doctype.created' }));
  assert.equal(await verifyChain(org._id), null, 'audit chain intact');

  console.log('core-smoke: model and API checks passed');
} finally {
  server.close();
  await disconnectDb();
  await mem.stop();
}
