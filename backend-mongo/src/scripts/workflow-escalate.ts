// Raises workflow escalations and reminders once. Run it on a schedule (for example every 15 minutes from cron):
//   npm run workflow:escalate
import { connectDb, disconnectDb } from '../db/connection.js';
import { runEscalations } from '../core/workflow.service.js';

await connectDb();
const n = await runEscalations();
console.log(`${n} record(s) escalated`);
await disconnectDb();
