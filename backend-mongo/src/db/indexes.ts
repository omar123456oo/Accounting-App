import mongoose from 'mongoose';
import '../models/index.js';
import '../hr/models.js';

/** Creates collections and builds every declared index. Run on deploy (npm run db:indexes). */
export async function syncAllIndexes(): Promise<void> {
  for (const m of Object.values(mongoose.models)) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
  }
}
