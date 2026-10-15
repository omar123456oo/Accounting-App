import type { Request } from 'express';
import { Router } from 'express';
import mongoose from 'mongoose';
import { appendAudit } from '../db/audit-chain.js';
import { Errors, HttpError, escapeRegex, isDate, notFound, orgOf, pageOf, wrap } from '../hr/common.js';
import { mergedFields, resolveDocType, type ResolvedDocType } from './doctypes.js';
import { runHooks } from './scripts.service.js';
import { activeWorkflow, assertEditable, loadActor, workflowBlock, type ActiveWorkflow, type Actor } from './workflow.service.js';
import type { FieldDef } from './fields.js';
import { DocCounter, DocRecord } from './models.js';

export const recordsRouter = Router();

const MAX_TEXT = 2000;
type Data = Record<string, unknown>;

/** An admin-made type the caller may view. Built-in types have their own APIs, so they are 404 here. */
export async function typeOf(req: Request): Promise<ResolvedDocType> {
  const dt = await resolveDocType(orgOf(req), String(req.params.doctype));
  if (!dt || !dt.isCustom || !req.auth!.permissions.includes(dt.viewPermission)) throw notFound();
  return dt;
}

function requireManage(req: Request, dt: ResolvedDocType): void {
  if (!dt.managePermission || !req.auth!.permissions.includes(dt.managePermission)) throw new HttpError(403, 'Forbidden.');
}

const isBlank = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * Checks `input` against the field list. `base` is the stored data (empty on create); fields in `input` replace it and
 * `null` clears an optional field. The result is the complete new data object, or a 422 listing every problem.
 */
async function validate(req: Request, fields: FieldDef[], input: unknown, base: Data): Promise<Data> {
  const errors = new Errors();
  if (!input || typeof input !== 'object' || Array.isArray(input)) { errors.add('data', 'Send a data object.'); errors.throwIfAny(); }
  const sent = input as Data;
  const known = new Map(fields.map((f) => [f.fieldname, f]));
  for (const k of Object.keys(sent)) if (!known.has(k)) errors.add(`data.${k}`, 'Unknown field.');
  const out: Data = { ...base };
  for (const f of fields) {
    const key = `data.${f.fieldname}`;
    if (Object.prototype.hasOwnProperty.call(sent, f.fieldname)) {
      const v = sent[f.fieldname];
      if (isBlank(v) && f.fieldtype !== 'checkbox') { delete out[f.fieldname]; }
      else {
        switch (f.fieldtype) {
          case 'text': if (typeof v !== 'string') errors.add(key, 'Enter text.'); else if (v.length > MAX_TEXT) errors.add(key, `At most ${MAX_TEXT} characters.`); else out[f.fieldname] = v.trim(); break;
          case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) errors.add(key, 'Enter a valid number.'); else out[f.fieldname] = v; break;
          case 'currency': if (typeof v !== 'number' || !Number.isFinite(v)) errors.add(key, 'Enter a valid amount.'); else if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) errors.add(key, 'At most two decimal places.'); else out[f.fieldname] = v; break;
          case 'date': if (!isDate(v)) errors.add(key, 'Use the format YYYY-MM-DD.'); else out[f.fieldname] = v; break;
          case 'checkbox': if (typeof v !== 'boolean') errors.add(key, 'Must be true or false.'); else out[f.fieldname] = v; break;
          case 'select': if (typeof v !== 'string' || !f.options?.includes(v)) errors.add(key, 'Unknown choice.'); else out[f.fieldname] = v; break;
          case 'link': {
            if (typeof v !== 'string' || v.length > 140) { errors.add(key, 'Enter a record name.'); break; }
            const target = f.options?.[0];
            // Only admin-made targets can be checked here; a link to anything else is kept as written.
            if (target && (await DocRecord.exists({ organizationId: orgOf(req), doctype: target, name: v })) === null && (await resolveDocType(orgOf(req), target))?.isCustom) errors.add(key, 'This record does not exist.');
            else out[f.fieldname] = v;
            break;
          }
        }
      }
    }
    if (f.required && isBlank(out[f.fieldname]) && !(f.fieldtype === 'checkbox' && out[f.fieldname] === true)) errors.add(key, 'Required.');
  }
  errors.throwIfAny();
  return out;
}

type Rec = { name: string; data?: unknown; createdAt?: Date; updatedAt?: Date; workflowState?: string | null };

/** The record as the API returns it. `workflow` (full block) is added for a single record when the type has an active workflow. */
export const dto = (dt: ResolvedDocType, r: Rec, wf?: ActiveWorkflow | null, actor?: Actor) => ({
  name: r.name,
  title: String((r.data as Data | undefined)?.[dt.titleField ?? ''] ?? r.name),
  data: r.data ?? {},
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  ...(wf && actor ? { workflow: workflowBlock(wf, r as never, actor) } : {}),
  ...(wf && !actor ? { state: r.workflowState || wf.initialState, stateLabel: wf.states.find((s) => s.name === (r.workflowState || wf.initialState))?.label } : {}),
});

const audit = (req: Request, action: string, dt: ResolvedDocType, name: string, before: unknown, after: unknown) =>
  appendAudit({ organizationId: orgOf(req), actorId: req.auth!.userId, action, entityType: 'DocRecord', entityId: `${dt.name}/${name}`, before, after, ip: req.ip });

recordsRouter.get('/records/:doctype', wrap(async (req, res) => {
  const dt = await typeOf(req);
  const org = orgOf(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const filter: Record<string, unknown> = { organizationId: org, doctype: dt.name };
  if (q) { const re = new RegExp(escapeRegex(q), 'i'); filter.$or = [{ name: re }, ...dt.searchFields.map((f) => ({ [`data.${f}`]: re }))]; }
  const { page, pageSize, skip } = pageOf(req.query);
  const [rows, total] = await Promise.all([DocRecord.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(), DocRecord.countDocuments(filter)]);
  const wf = await activeWorkflow(org, dt.name);
  res.json({ data: rows.map((r) => dto(dt, r, wf)), meta: { page, pageSize, total } });
}));

recordsRouter.get('/records/:doctype/:name', wrap(async (req, res) => {
  const dt = await typeOf(req);
  const r = await DocRecord.findOne({ organizationId: orgOf(req), doctype: dt.name, name: String(req.params.name) }).lean();
  if (!r) throw notFound();
  const wf = await activeWorkflow(orgOf(req), dt.name);
  res.json({ data: dto(dt, r, wf, wf ? await loadActor(req) : undefined) });
}));

recordsRouter.post('/records/:doctype', wrap(async (req, res) => {
  const dt = await typeOf(req);
  requireManage(req, dt);
  const org = orgOf(req);
  const fields = await mergedFields(org, dt);
  let data = await validate(req, fields, req.body?.data, {});
  const prefix = dt.name.toUpperCase().replace(/_/g, '-');
  const wf = await activeWorkflow(org, dt.name);
  // scripts may adjust the data; what they hand back is checked exactly like what the person typed
  const hooked = await runHooks(req, dt, 'before_save', { name: '', isNew: true, state: wf?.initialState ?? null, data });
  if (hooked.data !== data) data = await validate(req, fields, hooked.data, {});
  const now = new Date();
  const start = wf ? { workflowState: wf.initialState, stateEnteredAt: now, history: [{ at: now, actorId: req.auth!.userId, actorName: req.auth!.name, action: 'created', to: wf.initialState }] } : {};
  const session = await mongoose.startSession();
  let created: any;
  try {
    await session.withTransaction(async () => {
      const c = await DocCounter.findOneAndUpdate({ organizationId: org, doctype: dt.name }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
      [created] = await DocRecord.create([{ organizationId: org, doctype: dt.name, name: `${prefix}-${String(c!.seq).padStart(6, '0')}`, data, createdBy: req.auth!.userId, ...start }], { session });
    });
  } finally { await session.endSession(); }
  await audit(req, 'record.create', dt, created.name, null, data);
  const after = await runHooks(req, dt, 'after_save', { name: created.name, isNew: true, state: wf?.initialState ?? null, data });
  const messages = [...hooked.messages, ...after.messages];
  res.status(201).json({ data: dto(dt, created.toObject(), wf, wf ? await loadActor(req) : undefined), ...(messages.length ? { messages } : {}) });
}));

recordsRouter.put('/records/:doctype/:name', wrap(async (req, res) => {
  const dt = await typeOf(req);
  requireManage(req, dt);
  const org = orgOf(req);
  const name = String(req.params.name);
  const existing = await DocRecord.findOne({ organizationId: org, doctype: dt.name, name }).lean();
  if (!existing) throw notFound();
  const wf = await activeWorkflow(org, dt.name);
  assertEditable(wf, existing as never);
  const before = (existing.data ?? {}) as Data;
  const fields = await mergedFields(org, dt);
  let data = await validate(req, fields, req.body?.data, before);
  const hooked = await runHooks(req, dt, 'before_save', { name, isNew: false, state: existing.workflowState ?? wf?.initialState ?? null, data });
  if (hooked.data !== data) data = await validate(req, fields, hooked.data, {});
  const updated = await DocRecord.findOneAndUpdate({ _id: existing._id, organizationId: org }, { $set: { data } }, { new: true }).lean();
  await audit(req, 'record.update', dt, name, before, data);
  const after = await runHooks(req, dt, 'after_save', { name, isNew: false, state: updated!.workflowState ?? wf?.initialState ?? null, data });
  const messages = [...hooked.messages, ...after.messages];
  res.json({ data: dto(dt, updated!, wf, wf ? await loadActor(req) : undefined), ...(messages.length ? { messages } : {}) });
}));

recordsRouter.delete('/records/:doctype/:name', wrap(async (req, res) => {
  const dt = await typeOf(req);
  requireManage(req, dt);
  const name = String(req.params.name);
  const existing = await DocRecord.findOne({ organizationId: orgOf(req), doctype: dt.name, name }).lean();
  if (!existing) throw notFound();
  const wfNow = await activeWorkflow(orgOf(req), dt.name);
  assertEditable(wfNow, existing as never);
  await runHooks(req, dt, 'before_delete', { name, isNew: false, state: existing.workflowState ?? wfNow?.initialState ?? null, data: (existing.data ?? {}) as Data });
  const gone = await DocRecord.findOneAndDelete({ _id: existing._id, organizationId: orgOf(req) }).lean();
  if (!gone) throw notFound();
  await audit(req, 'record.delete', dt, name, gone.data, null);
  res.status(204).end();
}));
