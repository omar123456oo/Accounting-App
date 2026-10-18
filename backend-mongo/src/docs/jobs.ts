import { Types } from 'mongoose';
import { AiError } from './extraction/ai.js';
import { runPipeline } from './extraction/pipeline.js';
import { DocDocument, DocExtraction, DocJob, SmartDocType, DocVersion } from './models.js';
import { audit, setStatus } from './service.js';
import { fileStore } from './storage.js';
import { ensureDefaultTypes } from './default-types.js';

class PermanentError extends Error {}

const LEASE_MS = 5 * 60_000;
const backoff = (attempt: number): number => Math.min(30 * 60_000, 30_000 * 2 ** (attempt - 1));

/** Queues an extraction for one stored version. */
export async function enqueueExtraction(org: Types.ObjectId, documentId: Types.ObjectId, versionId: Types.ObjectId): Promise<void> {
  await DocJob.create({ organizationId: org, kind: 'extract', documentId, versionId, status: 'queued', runAfter: new Date() });
  await DocDocument.updateOne({ _id: documentId, organizationId: org }, { extractionStatus: 'queued' });
}

/** Takes one due job. A job whose lease ran out (the process died) is taken again. */
async function claim(now: Date) {
  return DocJob.findOneAndUpdate(
    { $or: [{ status: 'queued', runAfter: { $lte: now } }, { status: 'running', lockedUntil: { $lt: now } }], $expr: { $lt: ['$attempts', '$maxAttempts'] } },
    { $set: { status: 'running', lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { runAfter: 1 }, new: true });
}

/** Runs one claimed job to the end. Never throws: failures are recorded on the job and the document. */
export async function runOne(job: NonNullable<Awaited<ReturnType<typeof claim>>>): Promise<void> {
  const org = job.organizationId;
  const doc = await DocDocument.findOne({ _id: job.documentId, organizationId: org, deletedAt: { $exists: false } });
  const version = await DocVersion.findOne({ _id: job.versionId, organizationId: org });
  if (!doc || !version) { await DocJob.updateOne({ _id: job._id }, { status: 'failed', lastError: 'The document or file no longer exists.', finishedAt: new Date() }); return; }
  // A newer version replaced this one while the job waited: this result would be stale.
  if (doc.currentVersion !== version.version) { await DocJob.updateOne({ _id: job._id }, { status: 'succeeded', lastError: 'Superseded by a newer version.', finishedAt: new Date() }); return; }

  const intake = ['uploaded', 'processing', 'extraction_failed'].includes(doc.status);
  if (intake && doc.status !== 'processing') await setStatus(doc, 'processing', {}, 'extraction started');
  await DocDocument.updateOne({ _id: doc._id }, { extractionStatus: 'running' });
  const extraction = await DocExtraction.create({ organizationId: org, documentId: doc._id, versionId: version._id, versionNumber: version.version, status: 'running' });

  try {
    await ensureDefaultTypes(org);
    const types = (await SmartDocType.find({ organizationId: org, active: true }).lean()).map((t) => ({ key: t.key, label: t.label, keywords: t.keywords ?? [], fields: t.fields as never }));
    const bytes = await fileStore().get(version.storageKey);
    const r = await runPipeline({ bytes, types, typeKey: doc.typeChosen ? doc.typeKey : null, fallbackKey: doc.typeKey });
    extraction.set({
      status: r.status, provider: r.provider, steps: r.steps, pages: r.pages, detectedType: r.detectedType,
      fields: r.fields, notes: r.notes, error: r.error,
    });
    await extraction.save();
    if (r.pageCount && !version.pageCount) await DocVersion.updateOne({ _id: version._id }, { pageCount: r.pageCount });
    if (r.status === 'failed') throw new PermanentError(r.error ?? 'The PDF could not be processed.');

    if (!doc.typeChosen && r.detectedType.key && r.typeKey !== doc.typeKey) { doc.typeKey = r.typeKey; await doc.save(); }
    doc.extractionStatus = r.status;
    await doc.save();
    if (intake) await setStatus(doc, 'pending_review', {}, 'extraction finished');
    await audit(org, {}, 'extracted', doc._id, undefined, { status: r.status, type: r.typeKey, detected: r.detectedType.method });
    await DocJob.updateOne({ _id: job._id }, { status: 'succeeded', lockedUntil: null, lastError: null, finishedAt: new Date() });
  } catch (e) {
    const retryable = e instanceof AiError ? e.retryable : !(e instanceof PermanentError);
    const message = e instanceof AiError || e instanceof PermanentError ? e.message : 'Processing failed unexpectedly.';
    if (!(e instanceof AiError) && !(e instanceof PermanentError)) console.error('docs: extraction error', e);
    const final = !retryable || job.attempts >= job.maxAttempts;
    extraction.set({ status: 'failed', error: message });
    await extraction.save();
    if (final) {
      await DocJob.updateOne({ _id: job._id }, { status: 'failed', lastError: message, lockedUntil: null, finishedAt: new Date() });
      await DocDocument.updateOne({ _id: doc._id }, { extractionStatus: 'failed' });
      const fresh = await DocDocument.findById(doc._id);
      if (fresh && ['uploaded', 'processing'].includes(fresh.status)) await setStatus(fresh, 'extraction_failed', {}, message);
      await audit(org, {}, 'extraction_failed', doc._id, undefined, { error: message });
    } else {
      await DocJob.updateOne({ _id: job._id }, { status: 'queued', runAfter: new Date(Date.now() + backoff(job.attempts)), lockedUntil: null, lastError: message });
      await DocDocument.updateOne({ _id: doc._id }, { extractionStatus: 'queued' });
    }
  }
}

/** Runs due extraction jobs, one at a time, up to `limit`. */
export async function processJobs(limit = 5, now = new Date()): Promise<number> {
  let n = 0;
  for (; n < limit; n++) {
    const job = await claim(now);
    if (!job) break;
    await runOne(job);
  }
  return n;
}

/** Queues a retry of a failed job: used by the "retry" action. */
export async function retryExtraction(org: Types.ObjectId, documentId: Types.ObjectId): Promise<boolean> {
  const doc = await DocDocument.findOne({ _id: documentId, organizationId: org, deletedAt: { $exists: false } });
  if (!doc) return false;
  const version = await DocVersion.findOne({ organizationId: org, documentId, version: doc.currentVersion });
  if (!version) return false;
  await enqueueExtraction(org, doc._id, version._id);
  return true;
}
