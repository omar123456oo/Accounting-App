// Runs one pass of the smart-documents clock: expiry status, due reminders, extraction jobs. For cron when DOCS_SCHEDULER=false:
//   npm run docs:tick
import { connectDb, disconnectDb } from '../db/connection.js';
import { tick } from '../docs/reminders.service.js';

await connectDb();
console.log(JSON.stringify(await tick()));
await disconnectDb();
