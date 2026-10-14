// HTTP-level acceptance test for the leave module: rules, approvals, ledger integrity and concurrency.
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const { LeaveBalanceHead, LeaveLedger, LeaveType } = await import('../hr/leave.models.js');
const { Employee } = await import('../hr/models.js');
await connectDb();
const { password, org } = await seed();
const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;

class Client {
  jar = new Map<string, string>();
  constructor(public lang = 'en') {}
  async call(method: string, path: string, body?: unknown) {
    const x = this.jar.get('XSRF-TOKEN');
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'accept-language': this.lang, cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(x && { 'x-xsrf-token': x }) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }
  static async login(email: string, pw: string, lang = 'en') {
    const c = new Client(lang);
    await c.call('GET', '/sanctum/csrf-cookie');
    assert.equal((await c.call('POST', '/api/v1/auth/login', { email, password: pw })).status, 200, email);
    return c;
  }
  static as = (role: string, lang = 'en') => Client.login(`demo.${role}@demo.test`, password, lang);
}
const L = '/api/v1/staff/hr';

try {
  const karim = await Client.as('accountant');
  const owner = await Client.as('owner');
  const hr = await Client.as('hr_payroll');
  const chief = await Client.as('chief_accountant'); // no employee file

  const types = (await karim.call('GET', `${L}/leave-types`)).json.data;
  const annual = types.find((t: any) => t.nameEn === 'Annual leave');
  const unpaid = types.find((t: any) => t.nameEn === 'Unpaid leave');
  assert.equal(annual.entitlementDays, 21);
  assert.equal(unpaid.entitlementDays, null);
  const bal = async (c: Client, uid?: string) => (await c.call('GET', `${L}/leave-balances${uid ? `?userId=${uid}&year=2026` : '?year=2026'}`)).json.data.find((b: any) => b.typeId === annual.id);
  assert.deepEqual({ ...(await bal(karim)) }, { typeId: annual.id, year: 2026, entitlement: 21, used: 0, pending: 0, remaining: 21 });

  // --- validation -------------------------------------------------------------------------------
  const apply = (c: Client, o: object) => c.call('POST', `${L}/leave`, { typeId: annual.id, reason: 'x', ...o });
  assert.equal((await apply(karim, { from: '2026-11-22', to: '2026-11-21' })).status, 422); // order
  assert.equal((await apply(karim, { from: '2026-12-30', to: '2027-01-02' })).status, 422); // two years
  assert.equal((await apply(karim, { from: '2026-11-20', to: '2026-11-21' })).json.errors.from[0], 'These dates contain no working days.'); // Fri-Sat
  assert.equal((await apply(karim, { typeId: 'nope', from: '2026-11-22', to: '2026-11-23' })).status, 422);
  assert.equal((await apply(karim, { from: '2026-13-01', to: '2026-13-02' })).status, 422);
  assert.equal((await chief.call('POST', `${L}/leave`, { typeId: annual.id, from: '2026-11-22', to: '2026-11-23' })).json.errors.userId[0], 'This person is not an active employee.');
  const ar = await Client.as('chief_accountant', 'ar');
  assert.match((await ar.call('POST', `${L}/leave`, { typeId: annual.id, from: '2026-11-22', to: '2026-11-23' })).json.errors.userId[0], /ليس موظفًا/);

  // --- lifecycle --------------------------------------------------------------------------------
  const first = await apply(karim, { from: '2026-11-22', to: '2026-11-23' }); // Sun-Mon = 2 working days
  assert.equal(first.status, 201);
  assert.equal(first.json.data.days, 2);
  assert.equal(first.json.data.status, 'pending');
  assert.equal((await bal(karim)).pending, 2);
  assert.equal((await apply(karim, { from: '2026-11-23', to: '2026-11-24' })).status, 422); // overlaps
  assert.equal((await karim.call('POST', `${L}/leave/${first.json.data.id}/approve`)).status, 403); // no leave.approve
  assert.equal((await owner.call('POST', `${L}/leave/${first.json.data.id}/reject`, {})).status, 422); // reason needed
  const approved = await owner.call('POST', `${L}/leave/${first.json.data.id}/approve`, { note: 'ok' });
  assert.equal(approved.json.data.status, 'approved');
  assert.deepEqual([(await bal(karim)).used, (await bal(karim)).pending, (await bal(karim)).remaining], [2, 0, 19]);
  assert.equal((await owner.call('POST', `${L}/leave/${first.json.data.id}/approve`)).status, 409); // already decided
  assert.equal((await karim.call('POST', `${L}/leave/${first.json.data.id}/cancel`)).status, 409); // approved: only HR can undo
  assert.equal((await hr.call('POST', `${L}/leave/${first.json.data.id}/cancel`)).json.data.status, 'cancelled');
  assert.equal((await bal(karim)).used, 0);
  assert.equal((await hr.call('POST', `${L}/leave/${first.json.data.id}/cancel`)).status, 409); // cancelling twice cannot refund twice
  assert.equal((await bal(karim)).remaining, 21);

  const second = (await apply(karim, { from: '2026-11-29', to: '2026-11-30' })).json.data;
  assert.equal((await owner.call('POST', `${L}/leave/${second.id}/reject`, { note: 'Busy season' })).json.data.status, 'rejected');
  assert.equal((await bal(karim)).pending, 0);
  const third = (await apply(karim, { from: '2026-11-29', to: '2026-11-30' })).json.data; // freed dates can be requested again
  assert.equal((await karim.call('POST', `${L}/leave/${third.id}/cancel`)).json.data.status, 'cancelled');

  // nobody decides their own request
  const hrOwn = (await apply(hr, { from: '2026-11-22', to: '2026-11-22' })).json.data;
  assert.equal((await hr.call('POST', `${L}/leave/${hrOwn.id}/approve`)).status, 409);
  assert.equal((await owner.call('POST', `${L}/leave/${hrOwn.id}/approve`)).status, 200);

  // --- visibility -------------------------------------------------------------------------------
  assert.equal((await karim.call('GET', `${L}/leave`)).json.data.every((l: any) => l.userName === 'Karim Demo'), true);
  assert.ok((await owner.call('GET', `${L}/leave`)).json.data.some((l: any) => l.userName === 'Salma Demo'));
  assert.equal((await karim.call('POST', `${L}/leave/${hrOwn.id}/cancel`)).status, 404); // someone else's request
  const salmaUser = (await owner.call('GET', `${L}/leave`)).json.data.find((l: any) => l.userName === 'Salma Demo').userId;
  assert.equal((await karim.call('GET', `${L}/leave-balances?userId=${salmaUser}`)).status, 403);
  assert.equal((await hr.call('GET', `${L}/leave-balances?userId=${salmaUser}`)).status, 200);
  assert.equal((await karim.call('POST', `${L}/leave`, { typeId: annual.id, from: '2026-12-01', to: '2026-12-01', userId: salmaUser })).status, 403); // not on behalf of others

  // --- concurrency: the balance can never be over-spent, the same dates never booked twice ------
  const weeks = [['2026-12-06', '2026-12-10'], ['2026-12-13', '2026-12-17'], ['2026-12-20', '2026-12-24'], ['2026-12-27', '2026-12-31'], ['2026-01-04', '2026-01-08'], ['2026-01-11', '2026-01-15']];
  const burst = await Promise.all(weeks.map(([from, to]) => apply(karim, { from, to })));
  assert.equal(burst.filter((r) => r.status === 201).length, 4, 'only 4 x 5 = 20 of 21 days fit');
  assert.equal(burst.filter((r) => r.status === 422).length, 2);
  const same = await Promise.all([1, 2, 3, 4].map(() => apply(hr, { from: '2026-10-25', to: '2026-10-26' })));
  assert.equal(same.filter((r) => r.status === 201).length, 1, 'the same dates are booked once');
  const pend = burst.filter((r) => r.status === 201).map((r) => r.json.data.id);
  const race = await Promise.all([1, 2, 3].map(() => owner.call('POST', `${L}/leave/${pend[0]}/approve`)));
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409, 409], 'one approval wins');

  // --- the ledger explains every day, and matches the cached balance ----------------------------
  const karimEmp = (await Employee.findOne({ organizationId: org._id, employeeNo: 'EMP-00003' }).lean())!;
  for (const e of await Employee.find({ organizationId: org._id }).lean()) {
    for (const t of await LeaveType.find({ organizationId: org._id }).lean()) {
      for (const year of [2026]) {
        const rows = await LeaveLedger.find({ organizationId: org._id, employeeId: e._id, typeId: t._id, year }).lean();
        const sum = (k: string) => rows.filter((r) => r.kind === k).reduce((n, r) => n + r.days, 0);
        const head = await LeaveBalanceHead.findOne({ organizationId: org._id, employeeId: e._id, typeId: t._id, year }).lean();
        assert.equal(head?.used ?? 0, sum('use') - sum('use_reverse'), `used ${e.employeeNo}`);
        assert.equal(head?.pending ?? 0, sum('hold') - sum('hold_release'), `pending ${e.employeeNo}`);
        assert.equal(head?.adjustment ?? 0, sum('adjust'));
      }
    }
  }
  assert.ok(karimEmp);

  // --- adjustments and policy -------------------------------------------------------------------
  const karimUser = (await karim.call('GET', '/api/v1/auth/me')).json.user.id;
  const adj = (c: Client, o: object) => c.call('POST', `${L}/leave-adjustments`, { userId: karimUser, typeId: annual.id, year: 2026, days: 3, reason: 'Carry-over agreed', ...o });
  assert.equal((await adj(karim, {})).status, 403);
  assert.equal((await adj(hr, { days: 0 })).status, 422);
  assert.equal((await adj(hr, { reason: '' })).status, 422);
  assert.equal((await adj(hr, {})).json.data.entitlement, 24);

  assert.equal((await karim.call('GET', `${L}/settings`)).json.data.unpaidLeaveDivisor, 30);
  assert.equal((await karim.call('PUT', `${L}/settings`, { weekendDays: [5, 6], holidays: [], unpaidLeaveDivisor: 30 })).status, 403);
  assert.equal((await hr.call('PUT', `${L}/settings`, { weekendDays: [5, 6], holidays: ['bad'], unpaidLeaveDivisor: 30 })).status, 422);
  assert.equal((await hr.call('PUT', `${L}/settings`, { weekendDays: [5, 6], holidays: ['2027-02-02'], unpaidLeaveDivisor: 30 })).status, 200);
  const hol = await apply(hr, { typeId: unpaid.id, from: '2027-02-01', to: '2027-02-03' }); // Mon, Tue (holiday), Wed
  assert.equal(hol.json.data.days, 2);
  assert.equal((await hr.call('PUT', `${L}/leave-types/${unpaid.id}`, { nameAr: 'بدون أجر', nameEn: 'Unpaid leave', entitlementDays: null, paid: false, active: true })).status, 200);
  assert.equal((await karim.call('POST', `${L}/leave-types`, { nameAr: 'x', nameEn: 'x', paid: true, active: true })).status, 403);

  // --- a newly registered office owner can use leave straight away -----------------------------
  const eve = new Client();
  await eve.call('GET', '/sanctum/csrf-cookie');
  await eve.call('POST', '/api/v1/auth/register', { officeName: 'Other Office', name: 'Eve Adams', email: 'eve@other.example', password: 'a-long-unique-passphrase-1', passwordConfirmation: 'a-long-unique-passphrase-1' });
  await eve.call('POST', '/api/v1/auth/login', { email: 'eve@other.example', password: 'a-long-unique-passphrase-1' });
  const eveTypes = (await eve.call('GET', `${L}/leave-types`)).json.data;
  assert.equal(eveTypes.length, 4);
  assert.equal((await eve.call('POST', `${L}/leave`, { typeId: eveTypes[0].id, from: '2026-11-22', to: '2026-11-23' })).status, 201);
  assert.equal((await eve.call('POST', `${L}/leave`, { typeId: annual.id, from: '2026-12-01', to: '2026-12-02' })).status, 422); // another office's leave type
  assert.equal((await eve.call('POST', `${L}/leave/${pend[1]}/cancel`)).status, 404); // another office's request
  assert.equal((await eve.call('GET', `${L}/leave`)).json.data.length, 1);

  console.log('OK: leave (validation, lifecycle, visibility, concurrency, ledger integrity, adjustments, policy, tenant isolation)');
} finally {
  server.close(); await disconnectDb(); await mem.stop();
}
