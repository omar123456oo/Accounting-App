import { randomBytes, scryptSync } from 'node:crypto';
import { connectDb, disconnectDb } from '../db/connection.js';
import { syncAllIndexes } from '../db/indexes.js';
import { roleMatrix } from '../db/permissions.js';
import { seedHr } from '../hr/seed.js';
import { Organization, Role, User } from '../models/index.js';

const hash = (pw: string) => { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`; };

export async function seed() {
  await syncAllIndexes();
  const password = randomBytes(12).toString('base64url');
  const org = await Organization.findOneAndUpdate({ name: 'Demo Office' }, { $setOnInsert: { name: 'Demo Office' } }, { upsert: true, new: true });
  for (const [name, permissions] of Object.entries(roleMatrix())) {
    await Role.updateOne({ organizationId: org._id, name }, { $set: { permissions } }, { upsert: true });
  }
  let created = 0;
  for (const role of Object.keys(roleMatrix()).filter((r) => r !== 'client')) {
    const email = `demo.${role}@demo.test`;
    if (await User.exists({ email })) continue;
    await User.create({ organizationId: org._id, name: role, email, passwordHash: hash(password), type: 'staff', roles: [role], emailVerifiedAt: new Date() });
    created++;
  }
  await seedHr(org._id);
  return { org, created, password };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDb();
  const r = await seed();
  console.log(r.created ? `Seeded ${r.created} users. Dev password (shown once): ${r.password}` : 'Already seeded');
  await disconnectDb();
}
