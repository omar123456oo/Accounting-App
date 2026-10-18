import mongoose from 'mongoose';
import '../models/index.js';
import '../hr/models.js';
import '../hr/leave.models.js';
import '../core/models.js';
import '../core/workflow.models.js';
import '../core/script.models.js';
import '../docs/models.js';

/** Creates collections and builds every declared index. Run on deploy (npm run db:indexes). */
export async function syncAllIndexes(): Promise<void> {
  for (const m of Object.values(mongoose.models)) {
    await m.createCollection().catch(() => undefined);
    await m.syncIndexes();
  }
}
