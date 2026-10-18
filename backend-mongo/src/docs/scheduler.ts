import { env } from '../config/env.js';
import { processJobs } from './jobs.js';
import { tick } from './reminders.service.js';

let timer: NodeJS.Timeout | undefined;
let fast: NodeJS.Timeout | undefined;
let running = false;
let reading = false;

/**
 * Runs the clock-driven work (expiry status, due reminders, extraction jobs) inside the API process.
 * Everything it does is claimed through leases in MongoDB, so a second instance, a restart in the middle of a tick, or this loop plus
 * `npm run docs:tick` from cron never send a reminder twice.
 */
export function startScheduler(): void {
  if (timer) return;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { console.error('docs: scheduler tick failed', e); } finally { running = false; }
  };
  timer = setInterval(run, env.docs.tickMs);
  timer.unref();
  // Extraction jobs are picked up within seconds so an upload is read straight away; reminders and expiry only need the slower pass.
  fast = setInterval(async () => { if (reading || running) return; reading = true; try { await processJobs(3); } catch (e) { console.error('docs: job pass failed', e); } finally { reading = false; } }, 2000);
  fast.unref();
  void run();
  console.log(`docs: scheduler on (every ${Math.round(env.docs.tickMs / 1000)}s)`);
}

export function stopScheduler(): void { if (timer) clearInterval(timer); if (fast) clearInterval(fast); timer = undefined; fast = undefined; }
