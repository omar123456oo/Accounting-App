// The real API on a local MongoDB that needs no Docker, seeded with the demo office.
// The database listens on a fixed port (DEV_MONGO_PORT, default 27018): a replica set remembers its address. Data is kept in ./.devdata between restarts (delete that folder to start clean). Not for shared or production use.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const dir = resolve(process.env.DEV_DATA_DIR ?? '.devdata');
const dbPath = resolve(dir, 'mongo');
mkdirSync(dbPath, { recursive: true });
const mem = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger', dbName: 'accounting' }, instanceOpts: [{ dbPath, port: Number(process.env.DEV_MONGO_PORT ?? 27018), storageEngine: 'wiredTiger' }] });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const { startScheduler } = await import('../docs/scheduler.js');
await connectDb();
const { password, created } = await seed();
const pwFile = resolve(dir, 'password.txt');
// The seed only sets a password when it creates users, so remember it for the next start.
if (created) writeFileSync(pwFile, password, { mode: 0o600 });
const shown = existsSync(pwFile) ? readFileSync(pwFile, 'utf8') : '(created in an earlier run without a saved password: delete .devdata to start clean)';
startScheduler();
const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => {
  console.log(`API on :${port} (local MongoDB in ${dbPath})`);
  console.log(`Sign in as demo.owner@demo.test (also demo.<role>@demo.test) with password: ${shown}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => disconnectDb().then(() => mem.stop()).then(() => process.exit(0))));
}
