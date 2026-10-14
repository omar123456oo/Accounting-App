// HTTP-level check of register -> login -> me -> staff route -> logout, with CSRF and cookies, on an in-memory replica set.
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
await connectDb();
const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;
const jar = new Map<string, string>();
const call = async (method: string, path: string, body?: unknown) => {
  const x = jar.get('XSRF-TOKEN');
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(x && { 'x-xsrf-token': x }) }, body: body ? JSON.stringify(body) : undefined });
  for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, v] = kv.split('='); c.includes('Max-Age=0') || /Expires=Thu, 01 Jan 1970/.test(c) ? jar.delete(k) : jar.set(k, v); }
  return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) as any };
};
try {
  const pw = 'a-long-unique-passphrase-1';
  assert.equal((await call('POST', '/api/v1/auth/register', {})).status, 419); // no CSRF yet
  await call('GET', '/sanctum/csrf-cookie');
  assert.equal((await call('POST', '/api/v1/auth/register', { officeName: 'X', name: 'Me', email: 'me@example.com', password: 'short', passwordConfirmation: 'short' })).status, 422);
  assert.equal((await call('POST', '/api/v1/auth/register', { officeName: 'My Office', name: 'Me', email: 'Me@Example.com', password: pw, passwordConfirmation: pw })).status, 201);
  assert.equal((await call('GET', '/api/v1/auth/me')).status, 401);
  assert.equal((await call('POST', '/api/v1/auth/login', { email: 'me@example.com', password: 'wrong-password-123' })).status, 422);
  const login = await call('POST', '/api/v1/auth/login', { email: 'me@example.com', password: pw });
  assert.equal(login.status, 200);
  assert(login.json.user.permissions.includes('admin.users'));
  assert.equal((await call('GET', '/api/v1/auth/me')).json.user.name, 'Me');
  assert.equal((await call('GET', '/api/v1/staff/ping')).json.pong, true);
  assert.equal((await call('POST', '/api/v1/auth/logout')).status, 204);
  assert.equal((await call('GET', '/api/v1/auth/me')).status, 401);
  for (let i = 0; i < 5; i++) await call('POST', '/api/v1/auth/login', { email: 'me@example.com', password: 'wrong-password-123' });
  assert.equal((await call('POST', '/api/v1/auth/login', { email: 'me@example.com', password: pw })).status, 423);
  console.log('OK: register, login, me, staff route, logout, lockout, CSRF');
} finally {
  server.close(); await disconnectDb(); await mem.stop();
}
