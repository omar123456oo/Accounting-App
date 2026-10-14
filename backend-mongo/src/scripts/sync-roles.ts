// Brings every organization's roles up to the current permission matrix (run after the matrix changes). Safe to repeat.
import { connectDb, disconnectDb } from '../db/connection.js';
import { roleMatrix } from '../db/permissions.js';
import { Organization, Role } from '../models/index.js';

await connectDb();
let n = 0;
for (const org of await Organization.find({}, { _id: 1 }).lean()) {
  for (const [name, permissions] of Object.entries(roleMatrix())) {
    const r = await Role.updateOne({ organizationId: org._id, name }, { $set: { permissions } }, { upsert: true });
    n += r.modifiedCount + r.upsertedCount;
  }
}
console.log(`Roles updated: ${n}`);
await disconnectDb();
