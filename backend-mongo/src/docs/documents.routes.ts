import { createHash } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { can } from '../auth/session.js';
import { env } from '../config/env.js';
import { AuditEvent } from '../models/audit-event.js';
import { Department, Employee } from '../hr/models.js';
import { User } from '../models/index.js';
import { Errors, HttpError, escapeRegex, idOf, notFound, orgOf, pageOf, text, wrap } from '../hr/common.js';
import { ensureDefaultTypes } from './default-types.js';
import { PdfError, precheck } from './extraction/pdf.js';
import { derivedDates, validateValues } from './fields.js';
import { docDto, fieldsOf, forbidden, has, loadDoc, sensitiveKeys, visibleFilter } from './access.js';
import { enqueueExtraction } from './jobs.js';
import { DocDocument, DocExtraction, DocJob, SmartDocType, DocVersion, DOC_STATUSES, type DocFieldDef } from './models.js';
import { cancelReminders, rescheduleDocument } from './reminders.service.js';
import { audit, reevaluate, setStatus, todayIn } from './service.js';
import { fileStore } from './storage.js';

export const documentsRouter = Router();
const view = can('documents.view');

const maxBytes = () => env.docs.maxUploadMb * 1_048_576;
const uploader = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes(), files: 1, fields: 30, fieldSize: 20_000, parts: 40 } });
/** Runs multer and turns its errors into the API's own 413 and 422 answers. */
const receive = (req: Request, res: Response, next: NextFunction): void => {
  uploader.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `The file is larger than ${env.docs.maxUploadMb} MB.`));
    next(new HttpError(422, 'The upload could not be read.', { file: ['Send one PDF in the "file" field.'] }));
  });
};

const actorOf = (req: Request) => ({ id: req.auth!.userId, ip: req.ip });
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Checks the uploaded bytes and answers with the field-level message the screen can show under the file picker. */
function checkFile(file: Express.Multer.File | undefined): Buffer {
  if (!file) throw new HttpError(422, 'The given data was invalid.', { file: ['Choose a PDF file.'] });
  if (!/\.pdf$/i.test(file.originalname)) throw new HttpError(422, 'The given data was invalid.', { file: ['Only PDF files are accepted.'] });
  try { precheck(file.buffer, maxBytes()); } catch (e) {
    if (e instanceof PdfError) throw new HttpError(e.code === 'too_large' ? 413 : 422, e.message, { file: [e.message] });
    throw e;
  }
  return file.buffer;
}

/** People and records a document may point at: all must belong to the same office. */
async function links(req: Request, body: Record<string, unknown>, errors: Errors) {
  const org = orgOf(req);
  const out: Record<string, Types.ObjectId | null> = {};
  const one = async (field: string, check: (id: Types.ObjectId) => Promise<unknown>) => {
    if (!(field in body)) return;
    if (body[field] === null || body[field] === '') { out[field] = null; return; }
    const id = idOf(body[field]);
    if (!id || !(await check(id))) errors.add(field, 'Unknown reference.'); else out[field] = id;
  };
  await one('ownerId', (id) => User.exists({ _id: id, organizationId: org, type: 'staff' }));
  await one('reviewerId', (id) => User.exists({ _id: id, organizationId: org, type: 'staff' }));
  await one('employeeId', (id) => Employee.exists({ _id: id, organizationId: org }));
  await one('departmentId', (id) => Department.exists({ _id: id, organizationId: org }));
  return out;
}

const parseBool = (v: unknown): boolean => v === true || v === 'true' || v === '1';

// ---- list and read ---------------------------------------------------------------------------------------------------------
documentsRouter.get('/documents', view, wrap(async (req, res) => {
  const { page, pageSize, skip } = pageOf(req.query);
  const filter: Record<string, any> = visibleFilter(req);
  const and: unknown[] = [];
  const q = text(req.query.q, 100);
  if (q) and.push({ $or: [{ title: new RegExp(escapeRegex(q), 'i') }, { number: new RegExp(escapeRegex(q), 'i') }] });
  const status = text(req.query.status, 30);
  if (status && (DOC_STATUSES as readonly string[]).includes(status)) filter.status = status;
  const typeKey = text(req.query.typeKey, 60); if (typeKey) filter.typeKey = typeKey;
  for (const f of ['ownerId', 'departmentId', 'employeeId', 'reviewerId'] as const) { const id = idOf(req.query[f]); if (id) filter[f] = id; }
  const ex = text(req.query.extractionStatus, 20); if (ex) filter.extractionStatus = ex;
  if (req.query.expiring === 'true') filter.status = { $in: ['expiring_soon', 'expired'] };
  const from = text(req.query.expiryFrom, 10); const to = text(req.query.expiryTo, 10);
  if (from || to) filter.expiryDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  const cf = text(req.query.createdFrom, 10); const ct = text(req.query.createdTo, 10);
  if (cf || ct) filter.createdAt = { ...(cf ? { $gte: new Date(cf) } : {}), ...(ct ? { $lte: new Date(ct + 'T23:59:59.999Z') } : {}) };
  const finalFilter = and.length ? { $and: [filter, ...and] } : filter;
  const sortKey = ['createdAt', 'title', 'expiryDate', 'status', 'updatedAt'].includes(String(req.query.sort)) ? String(req.query.sort) : 'createdAt';
  const dir = req.query.dir === 'asc' ? 1 : -1;
  const [rows, total, types] = await Promise.all([
    DocDocument.find(finalFilter).sort({ [sortKey]: dir, _id: -1 }).skip(skip).limit(pageSize).lean(),
    DocDocument.countDocuments(finalFilter),
    SmartDocType.find({ organizationId: orgOf(req) }, { key: 1, label: 1, fields: 1 }).lean(),
  ]);
  const byKey = new Map(types.map((t) => [t.key, t]));
  res.json({ data: rows.map((d) => docDto(d, (byKey.get(d.typeKey)?.fields ?? []) as DocFieldDef[], req, { typeLabel: byKey.get(d.typeKey)?.label ?? d.typeKey })), meta: { page, pageSize, total } });
}));

documentsRouter.get('/documents/:id', view, wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  const type = await SmartDocType.findOne({ organizationId: orgOf(req), key: doc.typeKey }).lean();
  const owner = doc.ownerId ? await User.findById(doc.ownerId, { name: 1 }).lean() : null;
  res.json({ data: docDto(doc.toObject(), (type?.fields ?? []) as DocFieldDef[], req, { typeLabel: type?.label ?? doc.typeKey, ownerName: owner?.name ?? null }) });
}));

// ---- upload ------------------------------------------------------------------------------------------------------------------
documentsRouter.post('/documents', can('documents.upload'), receive, wrap(async (req, res) => {
  const org = orgOf(req);
  const bytes = checkFile(req.file);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = new Errors();
  await ensureDefaultTypes(org);
  const typeKey = text(body.typeKey, 60);
  if (typeKey && !(await SmartDocType.exists({ organizationId: org, key: typeKey, active: true }))) errors.add('typeKey', 'Unknown document type.');
  const ref = await links(req, body, errors);
  errors.throwIfAny();

  const hash = sha256(bytes);
  if (!parseBool(body.allowDuplicate)) {
    // The existing document is not named: the person may not be allowed to open it.
    if (await DocDocument.exists({ organizationId: org, contentHash: hash, deletedAt: { $exists: false } })) throw new HttpError(409, 'A document with identical content already exists.', { file: ['This exact file is already stored.'] });
  }
  const key = await fileStore().put(String(org), bytes);
  try {
    const title = text(body.title, 200) ?? req.file!.originalname.replace(/\.pdf$/i, '').slice(0, 200);
    const doc = await DocDocument.create({
      organizationId: org, typeKey: typeKey ?? 'other', typeChosen: !!typeKey, title, status: 'uploaded', extractionStatus: 'none', contentHash: hash,
      visibility: body.visibility === 'restricted' ? 'restricted' : 'office', createdBy: req.auth!.userId, ownerId: ref.ownerId ?? req.auth!.userId,
      ...(ref.reviewerId ? { reviewerId: ref.reviewerId } : {}), ...(ref.employeeId ? { employeeId: ref.employeeId } : {}), ...(ref.departmentId ? { departmentId: ref.departmentId } : {}),
      ...(text(body.relatedKind, 40) && text(body.relatedId, 80) ? { related: { kind: text(body.relatedKind, 40), id: text(body.relatedId, 80) } } : {}),
    });
    const version = await DocVersion.create({ organizationId: org, documentId: doc._id, version: 1, storageKey: key, fileName: req.file!.originalname.slice(0, 200), sizeBytes: bytes.length, sha256: hash, uploadedBy: req.auth!.userId });
    await enqueueExtraction(org, doc._id, version._id);
    await audit(org, actorOf(req), 'uploaded', doc._id, undefined, { title, file: version.fileName, sha256: hash, size: bytes.length });
    res.status(201).json({ data: docDto((await DocDocument.findById(doc._id).lean())!, [], req) });
  } catch (e) {
    await fileStore().remove(key).catch(() => undefined);
    throw e;
  }
}));

// ---- versions and files --------------------------------------------------------------------------------------------------
documentsRouter.get('/documents/:id/versions', view, wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  const rows = await DocVersion.find({ organizationId: orgOf(req), documentId: doc._id }).sort({ version: -1 }).lean();
  const users = new Map((await User.find({ _id: { $in: rows.map((r) => r.uploadedBy).filter(Boolean) } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
  res.json({ data: rows.map((v) => ({ version: v.version, fileName: v.fileName, sizeBytes: v.sizeBytes, sha256: v.sha256, pageCount: v.pageCount ?? null, uploadedBy: v.uploadedBy ? { id: String(v.uploadedBy), name: users.get(String(v.uploadedBy)) ?? null } : null, uploadedAt: (v as any).createdAt, reason: v.reason ?? null, current: v.version === doc.currentVersion })) });
}));

documentsRouter.post('/documents/:id/versions', can('documents.upload'), receive, wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  if (doc.status === 'archived') throw new HttpError(409, 'An archived document cannot be replaced.');
  const bytes = checkFile(req.file);
  const hash = sha256(bytes);
  if (hash === doc.contentHash) throw new HttpError(409, 'This file is identical to the current version.', { file: ['This file is identical to the current version.'] });
  const key = await fileStore().put(String(org), bytes);
  try {
    const next = doc.currentVersion + 1;
    const version = await DocVersion.create({ organizationId: org, documentId: doc._id, version: next, storageKey: key, fileName: req.file!.originalname.slice(0, 200), sizeBytes: bytes.length, sha256: hash, uploadedBy: req.auth!.userId, reason: text((req.body ?? {}).reason, 300) });
    doc.currentVersion = next; doc.contentHash = hash;
    await doc.save();
    // The new file must be read and approved again. Reminders stop until the dates are approved.
    if (doc.status !== 'processing') await setStatus(doc, 'processing', actorOf(req), 'file replaced');
    await cancelReminders(doc, 'document replaced');
    await enqueueExtraction(org, doc._id, version._id);
    await audit(org, actorOf(req), 'version_added', doc._id, undefined, { version: next, file: version.fileName, sha256: hash });
    res.status(201).json({ data: docDto((await DocDocument.findById(doc._id).lean())!, await fieldsOf(org, doc.typeKey), req) });
  } catch (e) { await fileStore().remove(key).catch(() => undefined); throw e; }
}));

documentsRouter.get('/documents/:id/file', view, wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  const inline = req.query.inline === '1';
  if (!inline && !has(req, 'documents.download')) throw forbidden();
  const n = Number(req.query.version) || doc.currentVersion;
  const v = await DocVersion.findOne({ organizationId: orgOf(req), documentId: doc._id, version: n });
  if (!v || !(await fileStore().exists(v.storageKey))) throw notFound();
  await audit(orgOf(req), actorOf(req), inline ? 'previewed' : 'downloaded', doc._id, undefined, { version: n });
  const safe = v.fileName.replace(/[^\w.\- ]+/g, '_');
  res.set({
    'Content-Type': 'application/pdf', 'Content-Length': String(v.sizeBytes), 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safe}"`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'; object-src 'self'; plugin-types application/pdf",
  });
  fileStore().stream(v.storageKey).on('error', () => res.destroy()).pipe(res);
}));

// ---- extraction and review ---------------------------------------------------------------------------------------------
const maskField = (f: any, secret: Set<string>, canSee: boolean) => (!canSee && secret.has(f.key) ? { key: f.key, state: f.state, issues: [], masked: true } : f);

documentsRouter.get('/documents/:id/extraction', view, wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  const ex = await DocExtraction.findOne({ organizationId: orgOf(req), documentId: doc._id }).sort({ createdAt: -1 }).lean();
  const fields = await fieldsOf(orgOf(req), doc.typeKey);
  if (!ex) return void res.json({ data: null });
  const secret = sensitiveKeys(fields); const see = has(req, 'documents.sensitive');
  const draft = Object.fromEntries(Object.entries((ex.draft ?? {}) as Record<string, any>).filter(([k]) => see || !secret.has(k)));
  res.json({ data: {
    id: String(ex._id), status: ex.status, versionNumber: ex.versionNumber, provider: ex.provider, steps: ex.steps, notes: ex.notes, error: ex.error ?? null, detectedType: ex.detectedType,
    pages: (ex.pages ?? []).map((p) => ({ page: p.page, method: p.method, chars: p.chars })), createdAt: (ex as any).createdAt,
    fields: (ex.fields ?? []).map((f) => maskField(f, secret, see)), draft, draftSavedAt: ex.draftSavedAt ?? null, approvedAt: ex.approvedAt ?? null,
  } });
}));

/** The text of one page: the reviewer's evidence. Hidden from people who may not see the type's sensitive fields. */
documentsRouter.get('/documents/:id/extraction/pages/:n', can('documents.review'), wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  const fields = await fieldsOf(orgOf(req), doc.typeKey);
  if (sensitiveKeys(fields).size && !has(req, 'documents.sensitive')) throw forbidden();
  const ex = await DocExtraction.findOne({ organizationId: orgOf(req), documentId: doc._id }).sort({ createdAt: -1 }).lean();
  const p = ex?.pages?.find((x) => x.page === Number(req.params.n));
  if (!p) throw notFound();
  res.json({ data: { page: p.page, method: p.method, text: p.text } });
}));

documentsRouter.post('/documents/:id/extract', can('documents.edit'), wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  if (doc.status === 'archived') throw new HttpError(409, 'An archived document cannot be processed.');
  const key = text((req.body ?? {}).typeKey, 60);
  if (key) {
    if (!(await SmartDocType.exists({ organizationId: org, key, active: true }))) throw new HttpError(422, 'The given data was invalid.', { typeKey: ['Unknown document type.'] });
    if (key !== doc.typeKey) { await audit(org, actorOf(req), 'type_changed', doc._id, { typeKey: doc.typeKey }, { typeKey: key }); doc.typeKey = key; }
    doc.typeChosen = true;
    await doc.save();
  }
  const v = await DocVersion.findOne({ organizationId: org, documentId: doc._id, version: doc.currentVersion });
  if (!v) throw notFound();
  if (await DocJob.exists({ organizationId: org, documentId: doc._id, status: { $in: ['queued', 'running'] } })) throw new HttpError(409, 'Processing is already under way.');
  if (['pending_review', 'extraction_failed'].includes(doc.status) && doc.status !== 'processing') await setStatus(doc, 'processing', actorOf(req), 'extraction requested');
  await enqueueExtraction(org, doc._id, v._id);
  await audit(org, actorOf(req), 'extraction_requested', doc._id);
  res.status(202).json({ data: { queued: true } });
}));

documentsRouter.put('/documents/:id/review', can('documents.review'), wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  if (doc.status !== 'pending_review') throw new HttpError(409, 'Only a document waiting for review can be reviewed.');
  const ex = await DocExtraction.findOne({ organizationId: org, documentId: doc._id }).sort({ createdAt: -1 });
  if (!ex) throw new HttpError(409, 'There is nothing to review yet.');
  const fields = await fieldsOf(org, doc.typeKey);
  const known = new Set(fields.filter((f) => f.active).map((f) => f.key));
  const secret = sensitiveKeys(fields); const see = has(req, 'documents.sensitive');
  const incoming = ((req.body ?? {}).draft ?? {}) as Record<string, any>;
  const next: Record<string, unknown> = { ...((ex.draft ?? {}) as Record<string, unknown>) };
  for (const [k, d] of Object.entries(incoming)) {
    if (!known.has(k) || (secret.has(k) && !see)) continue;
    if (!d || !['accepted', 'rejected', 'edited'].includes(d.decision)) continue;
    next[k] = { decision: d.decision, value: d.decision === 'rejected' ? null : d.value ?? null };
  }
  ex.draft = next; ex.draftSavedAt = new Date(); ex.draftBy = req.auth!.userId;
  ex.markModified('draft');
  await ex.save();
  res.json({ data: { savedAt: ex.draftSavedAt } });
}));

const maskForAudit = (values: Record<string, unknown>, secret: Set<string>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, secret.has(k) ? '[sensitive]' : v]));

/** Writes a person's approved values to the document and derives dates. Shared by approval, edit and renewal. */
async function applyValues(req: Request, doc: InstanceType<typeof DocDocument>, fields: DocFieldDef[], submitted: Record<string, unknown>, partial: boolean) {
  const see = has(req, 'documents.sensitive');
  const secret = sensitiveKeys(fields);
  const current = ((doc.values ?? {}) as Record<string, unknown>);
  // A person who cannot see sensitive fields neither changes nor loses them.
  const merged: Record<string, unknown> = partial ? { ...current, ...submitted } : { ...submitted };
  for (const k of secret) if (!see) { if (k in current) merged[k] = current[k]; else delete merged[k]; }
  const { clean, errors } = validateValues(fields, merged);
  if (Object.keys(errors).length) throw new HttpError(422, 'The given data was invalid.', errors);
  const before = current;
  doc.values = clean; doc.markModified('values');
  const d = derivedDates(fields, clean);
  doc.expiryDate = d.expiryDate; doc.startDate = d.startDate; doc.endDate = d.endDate; doc.renewalDate = d.renewalDate;
  const role = (r: string) => fields.find((f) => f.active && f.role === r)?.key;
  const t = role('title'); const n = role('number');
  if (t && typeof clean[t] === 'string') doc.title = clean[t] as string;
  if (n) doc.number = typeof clean[n] === 'string' ? (clean[n] as string) : undefined;
  return { before: maskForAudit(before, secret), after: maskForAudit(clean, secret), before_raw: before, clean };
}

documentsRouter.post('/documents/:id/approve', can('documents.review'), wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  if (doc.status !== 'pending_review') throw new HttpError(409, 'Only a document waiting for review can be approved.');
  const fields = await fieldsOf(org, doc.typeKey);
  const submitted = ((req.body ?? {}).values ?? {}) as Record<string, unknown>;
  const r = await applyValues(req, doc, fields, submitted, false);
  const ex = await DocExtraction.findOne({ organizationId: org, documentId: doc._id }).sort({ createdAt: -1 });
  const secret = sensitiveKeys(fields);
  if (ex) {
    ex.corrections = fields.filter((f) => f.active).flatMap((f) => {
      const proposed = ex.fields.find((x) => x.key === f.key)?.normalizedValue ?? null;
      const approved = r.clean[f.key] ?? null;
      return JSON.stringify(proposed) === JSON.stringify(approved) ? [] : [{ key: f.key, proposed: secret.has(f.key) ? '[sensitive]' : proposed, approved: secret.has(f.key) ? '[sensitive]' : approved, by: req.auth!.userId, at: new Date() }];
    }) as never;
    ex.approvedAt = new Date();
    await ex.save();
  }
  doc.approvedAt = new Date(); doc.approvedBy = req.auth!.userId; doc.reviewerId = doc.reviewerId ?? req.auth!.userId;
  await setStatus(doc, 'approved', actorOf(req), 'approved by a reviewer');
  await reevaluate(doc, todayIn());
  await audit(org, actorOf(req), 'approved', doc._id, r.before, r.after);
  await rescheduleDocument(doc);
  res.json({ data: docDto((await DocDocument.findById(doc._id).lean())!, fields, req) });
}));

// ---- edit, lifecycle ---------------------------------------------------------------------------------------------------
documentsRouter.patch('/documents/:id', can('documents.edit'), wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  if (doc.status === 'archived') throw new HttpError(409, 'An archived document cannot be edited.');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = new Errors();
  const ref = await links(req, body, errors);
  errors.throwIfAny();
  const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
  const set = (k: string, v: unknown, cur: unknown) => { if (String(v ?? '') !== String(cur ?? '')) { before[k] = cur ?? null; after[k] = v ?? null; (doc as any)[k] = v ?? undefined; } };
  if ('title' in body) { const t = text(body.title, 200); if (!t) throw new HttpError(422, 'The given data was invalid.', { title: ['Required.'] }); set('title', t, doc.title); }
  for (const k of ['ownerId', 'reviewerId', 'employeeId', 'departmentId'] as const) if (k in ref) set(k, ref[k], (doc as any)[k]);
  if (body.visibility === 'office' || body.visibility === 'restricted') set('visibility', body.visibility, doc.visibility);
  let touchedDates = false;
  if (body.values && typeof body.values === 'object') {
    if (!['approved', 'active', 'expiring_soon', 'expired', 'renewed'].includes(doc.status)) throw new HttpError(409, 'Approved values can be edited once the document is approved. Use the review screen before that.');
    const fields = await fieldsOf(org, doc.typeKey);
    const r = await applyValues(req, doc, fields, body.values as Record<string, unknown>, true);
    before.values = r.before; after.values = r.after; touchedDates = true;
  }
  if (!Object.keys(after).length) return void res.json({ data: docDto(doc.toObject(), await fieldsOf(org, doc.typeKey), req) });
  await doc.save();
  if (touchedDates) { await reevaluate(doc, todayIn()); await rescheduleDocument(doc); }
  await audit(org, actorOf(req), 'edited', doc._id, before, after);
  res.json({ data: docDto((await DocDocument.findById(doc._id).lean())!, await fieldsOf(org, doc.typeKey), req) });
}));

documentsRouter.post('/documents/:id/transition', wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  const to = String((req.body ?? {}).to);
  const reason = text((req.body ?? {}).reason, 300);
  if (to === 'archived') {
    if (!has(req, 'documents.archive')) throw forbidden();
    await setStatus(doc, 'archived', actorOf(req), reason);
    await cancelReminders(doc, 'document archived');
  } else if (to === 'pending_review' && doc.status === 'extraction_failed') {
    if (!has(req, 'documents.review')) throw forbidden();
    await setStatus(doc, 'pending_review', actorOf(req), reason ?? 'manual entry');
  } else throw new HttpError(422, 'That status change is not available here.', { to: ['Use "archived", or "pending_review" for a document whose extraction failed.'] });
  res.json({ data: docDto((await DocDocument.findById(doc._id).lean())!, await fieldsOf(org, doc.typeKey), req) });
}));

documentsRouter.post('/documents/:id/renew', can('documents.edit'), wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  await setStatus(doc, 'renewal_in_progress', actorOf(req), text((req.body ?? {}).reason, 300));
  doc.renewalStartedAt = new Date(); await doc.save();
  await cancelReminders(doc, 'renewal in progress');
  res.json({ data: docDto((await DocDocument.findById(doc._id).lean())!, await fieldsOf(org, doc.typeKey), req) });
}));

documentsRouter.post('/documents/:id/complete-renewal', can('documents.review'), wrap(async (req, res) => {
  const org = orgOf(req);
  const doc = await loadDoc(req, req.params.id);
  if (doc.status !== 'renewal_in_progress') throw new HttpError(409, 'Only a document being renewed can be completed.');
  const fields = await fieldsOf(org, doc.typeKey);
  const expiryKey = fields.find((f) => f.active && f.role === 'expiry_date')?.key ?? fields.find((f) => f.active && f.role === 'end_date')?.key;
  const oldExpiry = doc.expiryDate;
  const r = await applyValues(req, doc, fields, ((req.body ?? {}).values ?? {}) as Record<string, unknown>, true);
  if (expiryKey) {
    const n = r.clean[expiryKey];
    if (typeof n !== 'string' || (oldExpiry && n <= oldExpiry)) throw new HttpError(422, 'The given data was invalid.', { [expiryKey]: ['A renewal needs a new date later than the current one.'] });
  }
  await setStatus(doc, 'renewed', actorOf(req), 'renewal completed');
  await reevaluate(doc, todayIn());
  await audit(org, actorOf(req), 'renewed', doc._id, r.before, r.after);
  await rescheduleDocument(doc);
  res.json({ data: docDto((await DocDocument.findById(doc._id).lean())!, fields, req) });
}));

documentsRouter.delete('/documents/:id', can('documents.delete'), wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  doc.deletedAt = new Date(); await doc.save();
  await cancelReminders(doc, 'document deleted');
  await audit(orgOf(req), actorOf(req), 'deleted', doc._id, { title: doc.title }, undefined);
  res.status(204).end();
}));

documentsRouter.get('/documents/:id/history', view, wrap(async (req, res) => {
  const doc = await loadDoc(req, req.params.id);
  const org = orgOf(req);
  const [events, extractions] = await Promise.all([
    AuditEvent.find({ organizationId: org, entityType: 'SmartDocument', entityId: String(doc._id) }).sort({ seq: -1 }).limit(200).lean(),
    DocExtraction.find({ organizationId: org, documentId: doc._id }, { status: 1, steps: 1, provider: 1, error: 1, versionNumber: 1, createdAt: 1, notes: 1 }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const users = new Map((await User.find({ _id: { $in: events.map((e) => e.actorId).filter(Boolean) } }, { name: 1 }).lean()).map((u) => [String(u._id), u.name]));
  res.json({ data: {
    events: events.map((e) => ({ action: String(e.action).replace(/^docs\./, ''), at: e.occurredAt, actor: e.actorId ? users.get(String(e.actorId)) ?? null : null, before: e.before ?? null, after: e.after ?? null })),
    extractions: extractions.map((x) => ({ id: String(x._id), status: x.status, version: x.versionNumber, provider: x.provider, steps: x.steps, notes: x.notes, error: x.error ?? null, at: (x as any).createdAt })),
  } });
}));
