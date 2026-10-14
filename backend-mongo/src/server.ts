import { env } from './config/env.js';
import { connectDb, disconnectDb } from './db/connection.js';
import { syncAllIndexes } from './db/indexes.js';
import { createApp } from './app.js';

await connectDb();
if (env.autoIndex) await syncAllIndexes();
const server = createApp().listen(env.port, () => console.log(`API on :${env.port}, MongoDB connected`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => disconnectDb().then(() => process.exit(0))));
}
