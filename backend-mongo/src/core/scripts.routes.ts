import { Router } from 'express';
import { can } from '../auth/session.js';
import { appendAudit } from '../db/audit-chain.js';
import { Errors, HttpError, idOf, isDuplicateKey, notFound, orgOf, text, wrap } from '../hr/common.js';
import { isValidFieldname } from './fields.js';
import { resolveDocType } from './doctypes.js';
import { DocRecord } from './models.js';
import { runInSandbox, syntaxError } from './sandbox.js';
import { SCRIPT_KINDS, SERVER_EVENTS, Script, ScriptLog, type ServerEvent } from './script.models.js';
import { hostFor } from './scripts.service.js';
import { loadActor } from './workflow.service.js';
import { env } from '../config/env.js';

export const scriptsRouter = Router();
const developer = can('developer.scripts');

const MAX_CODE = 20_000;
const MAX_PER_EVENT = 10;

const dto = (s: any) => ({
  id: String(s._id), doctype: s.doctype, kind: s.kind, name: s.name, event: s.event ?? null, code: s.code, enabled: s.enabled, order: s.order,
  description: s.description ?? null, version: s.version, updatedAt: s.updatedAt,
});

/** The code as it goes into the audit trail: everything needed to see what changed. */
const snapshot = (s: any) => ({ doctype: s.doctype, kind: s.kind, name: s.name, event: s.event ?? null, code: s.code, enabled: s.enabled, order: s.order, version: s.version });

// Delivered to the browser of anyone who may view the type. Declared first so "client" is never read as a script id.
scriptsRouter.get('/scripts/client/:doctype', wrap(async (req, res) => {
  const dt = await resolveDocType(orgOf(req), String(req.params.doctype));
  if (!dt?.isCustom || !req.auth!.permissions.includes(dt.viewPermission)) throw notFound();
  const rows = await Script.find({ organizationId: orgOf(req), doctype: dt.name, kind: 'client', enabled: true }).sort({ order: 1, name: 1 }).lean();
  res.json({ data: rows.map((s) => ({ name: s.name, code: s.code, order: s.order })) });
}));

scriptsRouter.get('/scripts', developer, wrap(async (req, res) => {
  const filter: Record<string, unknown> = { organizationId: orgOf(req) };
  if (typeof req.query.doctype === 'string') filter.doctype = req.query.doctype;
  if (typeof req.query.kind === 'string') filter.kind = req.query.kind;
  res.json({ data: (await Script.find(filter).sort({ doctype: 1, kind: 1, order: 1, name: 1 }).lean()).map(dto) });
}));

const load = async (req: any) => {
  const id = idOf(req.params.id);
  const s = id && (await Script.findOne({ _id: id, organizationId: orgOf(req) }));
  if (!s) throw notFound();
  return s;
};

scriptsRouter.get('/scripts/:id', developer, wrap(async (req, res) => { res.json({ data: dto(await load(req)) }); }));

/** Checks the fields common to create and update; returns the cleaned values that were sent. */
async function parse(body: any, errors: Errors, creating: boolean, kind: string) {
  const out: { name?: string; event?: string | null; code?: string; enabled?: boolean; order?: number; description?: string | null } = {};
  if (creating || body.name !== undefined) { if (!isValidFieldname(body.name)) errors.add('name', 'Use lowercase letters, digits and underscores, starting with a letter (max 64).'); else out.name = body.name; }
  if (kind === 'server' && (creating || body.event !== undefined)) { if (!(SERVER_EVENTS as readonly string[]).includes(body.event)) errors.add('event', `Choose one of: ${SERVER_EVENTS.join(', ')}.`); else out.event = body.event; }
  if (creating || body.code !== undefined) {
    if (typeof body.code !== 'string' || !body.code.trim()) errors.add('code', 'Required.');
    else if (body.code.length > MAX_CODE) errors.add('code', `At most ${MAX_CODE} characters.`);
    else { const e = await syntaxError(body.code); if (e) errors.add('code', e); else out.code = body.code; }
  }
  if (body.enabled !== undefined) { if (typeof body.enabled !== 'boolean') errors.add('enabled', 'Must be true or false.'); else out.enabled = body.enabled; }
  if (body.order !== undefined) { if (!Number.isInteger(body.order) || body.order < 0 || body.order > 10_000) errors.add('order', 'A whole number from 0 to 10000.'); else out.order = body.order; }
  if (body.description !== undefined) out.description = text(body.description, 500) ?? null;
  return out;
}

scriptsRouter.post('/scripts', developer, wrap(async (req, res) => {
  const org = orgOf(req);
  const b = req.body ?? {};
  const dt = await resolveDocType(org, String(b.doctype ?? ''));
  if (!dt?.isCustom) throw notFound();
  const errors = new Errors();
  if (!(SCRIPT_KINDS as readonly string[]).includes(b.kind)) errors.add('kind', 'Use "server" or "client".');
  const v = await parse(b, errors, true, b.kind);
  if (!errors.map.event && b.kind === 'server' && v.event && (await Script.countDocuments({ organizationId: org, doctype: dt.name, kind: 'server', event: v.event })) >= MAX_PER_EVENT) errors.add('event', `At most ${MAX_PER_EVENT} scripts per event.`);
  errors.throwIfAny();
  let s;
  try {
    s = await Script.create({ organizationId: org, doctype: dt.name, kind: b.kind, name: v.name, event: b.kind === 'server' ? v.event : null, code: v.code, enabled: v.enabled ?? true, order: v.order ?? 100, description: v.description ?? undefined, createdBy: req.auth!.userId, updatedBy: req.auth!.userId });
  } catch (e) {
    if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { name: ['A script with this name already exists for this type.'] });
    throw e;
  }
  await appendAudit({ organizationId: org, actorId: req.auth!.userId, action: 'script.created', entityType: 'Script', entityId: String(s._id), after: snapshot(s), ip: req.ip });
  res.status(201).json({ data: dto(s) });
}));

scriptsRouter.put('/scripts/:id', developer, wrap(async (req, res) => {
  const s = await load(req);
  const errors = new Errors();
  const v = await parse(req.body ?? {}, errors, false, s.kind);
  errors.throwIfAny();
  const before = snapshot(s);
  const changesCode = (v.code !== undefined && v.code !== s.code) || (v.event !== undefined && v.event !== s.event);
  try {
    if (v.name !== undefined) s.name = v.name;
    if (v.event !== undefined) s.event = v.event as ServerEvent | null;
    if (v.code !== undefined) s.code = v.code;
    if (v.enabled !== undefined) s.enabled = v.enabled;
    if (v.order !== undefined) s.order = v.order;
    if (v.description !== undefined) s.description = v.description ?? undefined;
    if (changesCode) s.version += 1;
    s.updatedBy = req.auth!.userId;
    await s.save();
  } catch (e) {
    if (isDuplicateKey(e)) throw new HttpError(422, 'The given data was invalid.', { name: ['A script with this name already exists for this type.'] });
    throw e;
  }
  await appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action: 'script.updated', entityType: 'Script', entityId: String(s._id), before, after: snapshot(s), ip: req.ip });
  res.json({ data: dto(s) });
}));

scriptsRouter.delete('/scripts/:id', developer, wrap(async (req, res) => {
  const s = await load(req);
  await s.deleteOne();
  await appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action: 'script.deleted', entityType: 'Script', entityId: String(s._id), before: snapshot(s), ip: req.ip });
  res.status(204).end();
}));

/** Runs a server script once on a sample document, as the caller. Nothing is saved; the run is not logged. */
scriptsRouter.post('/scripts/:id/test', developer, wrap(async (req, res) => {
  const s = await load(req);
  if (s.kind !== 'server') throw new HttpError(422, 'Only server scripts run here.', { kind: ['Client scripts run in the browser.'] });
  if (!env.scriptsEnabled) throw new HttpError(503, 'Server scripts are switched off on this server.');
  const sample = req.body?.doc;
  if (!sample || typeof sample !== 'object' || Array.isArray(sample) || (sample.data !== undefined && (typeof sample.data !== 'object' || sample.data === null || Array.isArray(sample.data)))) throw new HttpError(422, 'Send { doc: { data: {...} } }.', { doc: ['Send a sample document.'] });
  const actor = await loadActor(req);
  const existing = typeof sample.name === 'string' ? await DocRecord.exists({ organizationId: orgOf(req), doctype: s.doctype, name: sample.name }) : null;
  const result = await runInSandbox({
    code: s.code,
    doc: { name: typeof sample.name === 'string' ? sample.name : '', isNew: !existing, state: typeof sample.state === 'string' ? sample.state : null, data: sample.data ?? {} },
    ctx: { user: { id: actor.self.userId, name: actor.self.name, roles: actor.self.roles }, event: s.event ?? 'before_save', doctype: s.doctype, ...(typeof req.body.action === 'string' ? { action: req.body.action } : {}) },
    host: hostFor(req), limits: { ms: Number(process.env.SCRIPT_HOOK_MS) || 500 },
  });
  res.json({ data: result });
}));

scriptsRouter.get('/scripts/:id/logs', developer, wrap(async (req, res) => {
  const s = await load(req);
  const rows = await ScriptLog.find({ organizationId: orgOf(req), scriptId: s._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ data: rows.map((l) => ({ at: l.createdAt, event: l.event, record: l.record, ok: l.ok, kind: l.kind ?? null, message: l.message ?? null, durationMs: l.durationMs, logs: l.logs, messages: l.messages })) });
}));
