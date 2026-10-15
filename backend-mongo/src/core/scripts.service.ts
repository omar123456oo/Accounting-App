import type { Request } from 'express';

import { env } from '../config/env.js';
import { appendAudit } from '../db/audit-chain.js';
import { HttpError, escapeRegex, orgOf } from '../hr/common.js';
import { resolveDocType, type ResolvedDocType } from './doctypes.js';
import { DocRecord } from './models.js';
import { runInSandbox, type SandboxHost, type SandboxResult } from './sandbox.js';
import { Script, ScriptLog, type ServerEvent } from './script.models.js';
import { loadActor } from './workflow.service.js';

/** The record as a script sees it. Only `data` is ever taken back, and only from `before_save`. */
export interface HookDoc { name: string; isNew: boolean; state: string | null; data: Record<string, unknown> }
export interface HookOutcome { data: Record<string, unknown>; messages: string[] }

const hookMs = (): number => Number(process.env.SCRIPT_HOOK_MS) || 500;
/** All scripts of one event together may use this much time. */
const BUDGET_MS = 2000;
const BREAKER_FAILURES = 3;
const BREAKER_WINDOW_MS = 10 * 60_000;

/** What a script may read: admin-made types the acting person may view. Anything else is "not allowed", whether or not it exists. */
export function hostFor(req: Request): SandboxHost {
  const org = orgOf(req);
  const allowed = async (doctype: string): Promise<ResolvedDocType> => {
    const dt = await resolveDocType(org, doctype);
    if (!dt?.isCustom || !req.auth!.permissions.includes(dt.viewPermission)) throw new Error(`Not allowed to read ${doctype}`);
    return dt;
  };
  const view = (r: { name: string; data?: unknown }) => ({ name: r.name, data: r.data ?? {} });
  return {
    async get(doctype, name) {
      const dt = await allowed(doctype);
      const r = await DocRecord.findOne({ organizationId: org, doctype: dt.name, name }).lean();
      return r ? view(r) : null;
    },
    async list(doctype, opts) {
      const dt = await allowed(doctype);
      const limit = Math.min(20, Math.max(1, opts.limit ?? 10));
      const filter: Record<string, unknown> = { organizationId: org, doctype: dt.name };
      if (opts.q) { const re = new RegExp(escapeRegex(opts.q), 'i'); filter.$or = [{ name: re }, ...dt.searchFields.map((f) => ({ [`data.${f}`]: re }))]; }
      return (await DocRecord.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean()).map(view);
    },
  };
}

async function record(req: Request, s: { _id: unknown; name: string; doctype: string }, event: string, doc: HookDoc, r: SandboxResult): Promise<void> {
  await ScriptLog.create({
    organizationId: orgOf(req), scriptId: s._id, name: s.name, doctype: s.doctype, event, record: doc.name, userId: req.auth!.userId,
    ok: r.ok, kind: r.ok ? undefined : r.kind, message: r.ok ? undefined : r.message, durationMs: r.durationMs, logs: r.logs, messages: r.messages,
  }).catch(() => undefined);
  // a script that keeps hanging or exhausting memory is switched off: it would otherwise tie up the server on every save
  if (!r.ok && (r.kind === 'timeout' || r.kind === 'memory')) {
    const recent = await ScriptLog.countDocuments({ scriptId: s._id, kind: { $in: ['timeout', 'memory'] }, createdAt: { $gte: new Date(Date.now() - BREAKER_WINDOW_MS) } });
    if (recent >= BREAKER_FAILURES) {
      await Script.updateOne({ _id: s._id }, { $set: { enabled: false } });
      await appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action: 'script.auto_disabled', entityType: 'Script', entityId: String(s._id), after: { name: s.name, reason: `${recent} timeouts or memory failures in 10 minutes` }, ip: req.ip }).catch(() => undefined);
    }
  }
}

/**
 * Runs the enabled server scripts of a type for one event, in order. A failing `before_*` script stops the operation (422);
 * a failing `after_*` script is only logged. `before_save` may change `doc.data`; the caller must validate what comes back.
 */
export async function runHooks(req: Request, dt: ResolvedDocType, event: ServerEvent, doc: HookDoc, extra: { action?: string; comment?: string } = {}): Promise<HookOutcome> {
  const out: HookOutcome = { data: doc.data, messages: [] };
  if (!env.scriptsEnabled) return out;
  const scripts = await Script.find({ organizationId: orgOf(req), doctype: dt.name, kind: 'server', event, enabled: true }).sort({ order: 1, name: 1 }).lean();
  if (!scripts.length) return out;
  const actor = await loadActor(req);
  const user = { id: actor.self.userId, name: actor.self.name, roles: actor.self.roles };
  const host = hostFor(req);
  const blocking = event.startsWith('before_');
  let spent = 0;
  for (const s of scripts) {
    const remaining = BUDGET_MS - spent;
    const result = remaining <= 0
      ? ({ ok: false, kind: 'timeout', message: 'The scripts of this event used up their time.', messages: [], logs: [], durationMs: 0 } as SandboxResult)
      : await runInSandbox({ code: s.code, doc: { ...doc, data: out.data }, ctx: { user, event, doctype: dt.name, ...extra }, host, limits: { ms: Math.min(hookMs(), remaining) } });
    spent += result.durationMs;
    await record(req, s, event, doc, result);
    out.messages.push(...result.messages);
    if (!result.ok) {
      if (blocking) throw new HttpError(422, 'A script stopped this.', { script: [`${s.name}: ${result.message}`] });
      continue;
    }
    if (event === 'before_save') out.data = result.doc.data;
  }
  return out;
}

