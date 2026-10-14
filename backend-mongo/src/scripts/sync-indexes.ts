import { connectDb, disconnectDb } from '../db/connection.js';
import { syncAllIndexes } from '../db/indexes.js';

await connectDb();
await syncAllIndexes();
console.log('Indexes synced');
await disconnectDb();
