// End-to-end check of the connection, models, indexes and audit chain. Uses MONGODB_URI, or a throwaway in-memory replica set if unset.
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mem: MongoMemoryReplSet | undefined;
if (!process.env.MONGODB_URI) {
  mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mem.getUri('accounting');
}
const { connectDb, disconnectDb, dbHealthy } = await import('../db/connection.js');
const { seed } = await import('./seed.js');
const { appendAudit, verifyChain } = await import('../db/audit-chain.js');
const { AuditEvent, User } = await import('../models/index.js');

try {
  await connectDb();
  assert(await dbHealthy(), 'ping failed');
  const { org } = await seed();
  assert.equal(await User.countDocuments({ organizationId: org._id }), 9);
  await assert.rejects(User.create({ organizationId: org._id, name: 'x', email: 'demo.owner@demo.test', passwordHash: 'x', type: 'staff' }), /duplicate key/);

  await Promise.all([1, 2, 3].map((i) => appendAudit({ organizationId: org._id, action: 'test', entityType: 'T', entityId: String(i), after: { i } })));
  assert.equal(await verifyChain(org._id), null);
  await assert.rejects(AuditEvent.updateOne({ seq: 1 }, { action: 'tamper' }), /append-only/);
  await AuditEvent.collection.updateOne({ seq: 2 }, { $set: { action: 'tamper' } });
  assert.equal(await verifyChain(org._id), 2);
  console.log('OK: connection, indexes, seed, audit chain');
} finally {
  await disconnectDb();
  await mem?.stop();
}
