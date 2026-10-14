// The real API on a throwaway in-memory MongoDB, seeded with the demo office. For trying the app without Docker.
// Everything is lost when the process stops. Not for shared or production use.
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
await connectDb();
const { password } = await seed();
const port = Number(process.env.PORT ?? 3000);
const server = createApp().listen(port, () => {
  console.log(`API on :${port} (in-memory MongoDB)`);
  console.log(`Sign in as demo.owner@demo.test (also demo.<role>@demo.test) with password: ${password}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => disconnectDb().then(() => mem.stop()).then(() => process.exit(0))));
}
