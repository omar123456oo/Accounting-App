import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/connection.js';
import { syncAllIndexes } from './db/indexes.js';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './docs/scheduler.js';

await connectDb();
if (env.autoIndex) await syncAllIndexes();
const server = createApp().listen(env.port, () => console.log(`API on :${env.port}, MongoDB connected`));
if (env.docs.schedulerOn) startScheduler();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { stopScheduler(); server.close(() => disconnectDb().then(() => process.exit(0))); });
}
