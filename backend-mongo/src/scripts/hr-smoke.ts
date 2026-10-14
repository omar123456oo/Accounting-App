// HTTP-level acceptance test for the HR core (organization, employees, contracts, dashboard, access control).
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const { expireDue } = await import('../hr/contract.routes.js');
const { Contract } = await import('../hr/models.js');
await connectDb();
const { password, org } = await seed();
const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;

class Client {
  jar = new Map<string, string>();
  async call(method: string, path: string, body?: unknown) {
    const x = this.jar.get('XSRF-TOKEN');
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(x && { 'x-xsrf-token': x }) }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* csv */ }
    return { status: res.status, json, text };
  }
  static async as(role: string) {
    const c = new Client();
    await c.call('GET', '/sanctum/csrf-cookie');
    assert.equal((await c.call('POST', '/api/v1/auth/login', { email: `demo.${role}@demo.test`, password })).status, 200, role);
    return c;
  }
}
const H = '/api/v1/staff/hrm';
const BAD_ID = '64b64b64b64b64b64b64b64b';

try {
  const hr = await Client.as('hr_payroll');
  const owner = await Client.as('owner');
  const acct = await Client.as('accountant'); // Karim: own record + one report (Nour)
  const chief = await Client.as('chief_accountant'); // staff without any HR file permission

  // --- access control ---------------------------------------------------------------------------
  assert.equal((await chief.call('GET', `${H}/dashboard`)).status, 403);
  assert.equal((await chief.call('POST', `${H}/branches`, { code: 'X', name: 'X' })).status, 403);
  assert.equal((await acct.call('POST', `${H}/employees`, { firstName: 'A', lastName: 'B' })).status, 403);
  assert.equal((await acct.call('GET', `${H}/dashboard`)).status, 403);

  // --- organization -----------------------------------------------------------------------------
  const tree = (await hr.call('GET', `${H}/departments-tree`)).json.data;
  const fin = tree.find((d: any) => d.code === 'FIN');
  assert.equal(fin.children[0].code, 'TAX');
  assert.equal((await hr.call('POST', `${H}/departments`, { code: 'FIN', name: 'Dup' })).status, 422);
  assert.equal((await hr.call('PATCH', `${H}/departments/${fin.id}`, { parentId: fin.children[0].id })).status, 422); // cycle
  assert.equal((await hr.call('PATCH', `${H}/departments/${fin.id}`, { parentId: fin.id })).status, 422); // self
  assert.equal((await hr.call('PATCH', `${H}/departments/${fin.id}`, { active: false })).status, 422); // has people
  assert.equal((await hr.call('POST', `${H}/grades`, { code: 'G9', name: 'Exec', level: 'x' })).status, 422);
  const ops = (await hr.call('POST', `${H}/departments`, { code: 'OPS', name: 'Operations', parentId: fin.id })).json.data;
  assert.equal(ops.code, 'OPS');

  // --- employees --------------------------------------------------------------------------------
  const list = (await hr.call('GET', `${H}/employees`)).json;
  assert.equal(list.meta.total, 4);
  const byNo = (no: string) => list.data.find((e: any) => e.employeeNo === no);
  const [boss, , karim, nour] = ['EMP-00001', 'EMP-00002', 'EMP-00003', 'EMP-00004'].map(byNo);

  assert.equal((await hr.call('POST', `${H}/employees`, { firstName: 'X' })).status, 422);
  const created = await hr.call('POST', `${H}/employees`, { firstName: 'Lina', lastName: 'Test', employmentType: 'full_time', hireDate: '2026-10-01', departmentId: ops.id, managerId: karim.id, nationalId: '29000000000000', bank: { bankName: 'Demo Bank', iban: 'EG000' }, email: 'LINA@test.example' });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.employeeNo, 'EMP-00005');
  assert.equal(created.json.data.email, 'lina@test.example');
  assert.equal(created.json.data.nationalId, '29000000000000');
  const lina = created.json.data;
  assert.equal((await hr.call('POST', `${H}/employees`, { firstName: 'D', lastName: 'D', employmentType: 'full_time', hireDate: '2026-10-01', employeeNo: 'EMP-00005' })).status, 422); // duplicate number
  assert.equal((await hr.call('POST', `${H}/employees`, { firstName: 'D', lastName: 'D', employmentType: 'full_time', hireDate: '2026-13-45' })).status, 422);
  const injected = await hr.call('POST', `${H}/employees`, { firstName: 'M', lastName: 'A', employmentType: 'full_time', hireDate: '2026-10-01', organizationId: BAD_ID, status: 'terminated' });
  assert.equal(injected.json.data.status, 'active'); // mass-assignment ignored

  // reporting-line cycle: Karim -> reports to Lina, who reports to Karim
  assert.equal((await hr.call('PATCH', `${H}/employees/${karim.id}`, { managerId: lina.id })).status, 422);
  assert.equal((await hr.call('PATCH', `${H}/employees/${karim.id}`, { managerId: karim.id })).status, 422);
  // history with effective date
  assert.equal((await hr.call('PATCH', `${H}/employees/${lina.id}`, { departmentId: fin.id, effectiveFrom: '2026-10-10' })).status, 200);
  assert.equal((await hr.call('PATCH', `${H}/employees/${lina.id}`, { departmentId: fin.id, effectiveFrom: '2999-01-01' })).status, 422);
  const hist = (await hr.call('GET', `${H}/employees/${lina.id}/history`)).json.data;
  assert.deepEqual(hist.map((h: any) => h.kind).sort(), ['changed', 'hired']);
  assert.equal(hist.find((h: any) => h.kind === 'changed').effectiveFrom, '2026-10-10');

  // visibility: Karim sees himself and his direct reports (Nour, Lina) only; sensitive fields follow entitlement
  const mine = (await acct.call('GET', `${H}/employees`)).json;
  assert.deepEqual(mine.data.map((e: any) => e.employeeNo).sort(), ['EMP-00003', 'EMP-00004', 'EMP-00005']); // himself + two direct reports
  assert.equal((await acct.call('GET', `${H}/employees/${boss.id}`)).status, 404); // not his
  assert.equal((await acct.call('GET', `${H}/employees/${lina.id}`)).json.data.nationalId, undefined); // a report, but no ID number for a manager
  assert.equal((await acct.call('GET', `${H}/employees/not-an-id`)).status, 404);
  assert.equal((await acct.call('GET', `${H}/employees/${BAD_ID}`)).status, 404);
  const seenByManager = (await acct.call('GET', `${H}/employees/${nour.id}`)).json.data;
  assert.equal(seenByManager.nationalId, undefined);
  assert.equal(seenByManager.bank, undefined);
  assert.equal(seenByManager.notes, undefined);
  const self = (await acct.call('GET', '/api/v1/me/hrm/employee')).json.data;
  assert.equal(self.employeeNo, 'EMP-00003');
  assert.equal((await acct.call('PATCH', `${H}/employees/${karim.id}`, { firstName: 'Hack' })).status, 403);
  assert.equal((await hr.call('GET', `${H}/employees?q=lina`)).json.meta.total, 1);
  assert.equal((await hr.call('GET', `${H}/employees?q=.*`)).json.meta.total, 0); // regex characters are escaped
  assert.ok((await hr.call('GET', `${H}/employees-export`)).text.startsWith('employeeNo,firstName'));

  // status machine
  assert.equal((await hr.call('POST', `${H}/employees/${lina.id}/status`, { to: 'terminated' })).status, 422); // needs reason + date
  assert.equal((await hr.call('POST', `${H}/employees/${lina.id}/rehire`, { hireDate: '2026-10-11' })).status, 422); // not terminated
  assert.equal((await hr.call('POST', `${H}/employees/${lina.id}/status`, { to: 'inactive' })).json.data.status, 'inactive');
  assert.equal((await hr.call('POST', `${H}/employees/${lina.id}/status`, { to: 'active' })).json.data.status, 'active');

  // --- contracts --------------------------------------------------------------------------------
  const c1 = await hr.call('POST', `${H}/contracts`, { employeeId: lina.id, type: 'fixed_term', startDate: '2026-10-01', endDate: '2026-12-31', probationMonths: 3, alertDays: 90 });
  assert.equal(c1.status, 201);
  assert.equal(c1.json.data.number, 'EMP-00005-C1');
  assert.equal(c1.json.data.status, 'draft');
  assert.equal((await hr.call('POST', `${H}/contracts`, { employeeId: lina.id, type: 'fixed_term', startDate: '2026-10-01' })).status, 422); // end required
  assert.equal((await hr.call('POST', `${H}/contracts`, { employeeId: lina.id, type: 'permanent', startDate: '2026-10-01', endDate: '2026-09-01' })).status, 422);
  assert.equal((await hr.call('POST', `${H}/contracts/${c1.json.data.id}/renew`, {})).status, 422); // not active yet
  assert.equal((await hr.call('POST', `${H}/contracts/${c1.json.data.id}/activate`)).json.data.status, 'active');
  assert.equal((await hr.call('POST', `${H}/contracts/${c1.json.data.id}/activate`)).status, 422); // idempotent-safe: cannot activate twice
  const clash = (await hr.call('POST', `${H}/contracts`, { employeeId: lina.id, type: 'fixed_term', startDate: '2026-11-01', endDate: '2027-03-01' })).json.data;
  assert.equal((await hr.call('POST', `${H}/contracts/${clash.id}/activate`)).status, 422); // overlaps
  assert.equal((await hr.call('POST', `${H}/contracts/${c1.json.data.id}/renew`, { startDate: '2027-02-01', endDate: '2027-12-31' })).status, 422); // gap
  const renewal = await hr.call('POST', `${H}/contracts/${c1.json.data.id}/renew`, { endDate: '2027-12-31', renewalTerms: 'Annual' });
  assert.equal(renewal.status, 201);
  assert.equal(renewal.json.data.startDate, '2027-01-01');
  assert.equal(renewal.json.data.number, 'EMP-00005-C1-V2');
  assert.equal((await hr.call('POST', `${H}/contracts/${c1.json.data.id}/renew`, { endDate: '2028-12-31' })).status, 422); // already in progress
  assert.equal((await hr.call('POST', `${H}/contracts/${c1.json.data.id}/amend`, { endDate: '2026-12-15' })).status, 422); // reason required
  const amended = await hr.call('POST', `${H}/contracts/${c1.json.data.id}/amend`, { endDate: '2026-12-30', reason: 'Agreed with employee' });
  assert.equal(amended.json.data.amendments.length, 1);
  assert.equal((await hr.call('POST', `${H}/contracts/${renewal.json.data.id}/activate`)).json.data.status, 'active');
  assert.equal((await hr.call('GET', `${H}/contracts/${c1.json.data.id}`)).json.data.status, 'renewed');
  assert.equal((await acct.call('GET', `${H}/contracts`)).status, 403);
  assert.equal((await acct.call('GET', '/api/v1/me/hrm/contracts')).json.data.length, 0); // Karim has none

  // expiry job is repeatable
  await Contract.updateOne({ _id: renewal.json.data.id }, { $set: { endDate: '2020-01-01' } });
  assert.equal(await expireDue(org._id), 1);
  assert.equal(await expireDue(org._id), 0);

  // terminating an employee ends their live contracts and records the exit
  const c3 = (await hr.call('POST', `${H}/contracts`, { employeeId: nour.id, type: 'permanent', startDate: '2026-09-20' })).json.data;
  await hr.call('POST', `${H}/contracts/${c3.id}/activate`);
  const term = await hr.call('POST', `${H}/employees/${nour.id}/status`, { to: 'terminated', reason: 'Resigned', exitDate: '2026-10-13', rehireEligible: false });
  assert.equal(term.json.data.status, 'terminated');
  assert.equal((await hr.call('GET', `${H}/contracts/${c3.id}`)).json.data.status, 'terminated');
  assert.equal((await hr.call('PATCH', `${H}/employees/${nour.id}`, { firstName: 'X' })).status, 200); // terminated records can still be corrected
  assert.equal((await hr.call('POST', `${H}/employees/${nour.id}/rehire`, { hireDate: '2026-11-01' })).status, 422); // not eligible
  assert.equal((await hr.call('POST', `${H}/contracts`, { employeeId: nour.id, type: 'permanent', startDate: '2026-11-01' })).status, 422); // has left

  // --- dashboard --------------------------------------------------------------------------------
  const d = (await hr.call('GET', `${H}/dashboard`)).json.data;
  assert.equal(d.terminated, 1);
  assert.equal(d.active, d.total - d.inactive - d.terminated);
  assert.ok(d.byDepartment.length > 0 && d.hiresByMonth.length > 0);
  assert.equal(d.turnover12m.terminations, 1);

  // --- other organizations can never be reached -------------------------------------------------
  const other = new Client();
  await other.call('GET', '/sanctum/csrf-cookie');
  await other.call('POST', '/api/v1/auth/register', { officeName: 'Other Office', name: 'Eve', email: 'eve@other.example', password: 'a-long-unique-passphrase-1', passwordConfirmation: 'a-long-unique-passphrase-1' });
  await other.call('POST', '/api/v1/auth/login', { email: 'eve@other.example', password: 'a-long-unique-passphrase-1' });
  assert.equal((await other.call('GET', `${H}/employees/${lina.id}`)).status, 404);
  assert.equal((await other.call('GET', `${H}/employees`)).json.meta.total, 0);
  assert.equal((await other.call('POST', `${H}/employees`, { firstName: 'E', lastName: 'E', employmentType: 'full_time', hireDate: '2026-10-01', managerId: lina.id })).status, 422); // foreign reference
  assert.equal((await other.call('GET', `${H}/contracts/${c1.json.data.id}`)).status, 404);
  assert.equal((await owner.call('GET', `${H}/employees`)).json.meta.total, 6);

  console.log('OK: HR core (access control, organization, employees, history, contracts, dashboard, tenant isolation)');
} finally {
  server.close(); await disconnectDb(); await mem.stop();
}
