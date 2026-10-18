// Acceptance test for smart documents: upload, extraction, review, lifecycle, reminders, notifications, permissions.
// Runs on an in-memory MongoDB with a fake AI service, a fake OCR service and a fake mail server. Needs no network.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { latinDigits, normalizeCurrency, normalizeDate, normalizeNationalId, normalizeNumber, isAmbiguousDate } from '../docs/normalize.js';
import { addMonthsIso, applyOffset, occurrences, zonedToUtc } from '../docs/schedule.js';
import { canTransition, evaluateStatus } from '../docs/lifecycle.js';
import { validateFieldDefs, validateValues } from '../docs/fields.js';
import { buildPage } from '../docs/extraction/pdf.js';
import { locate } from '../docs/extraction/locate.js';

// ---- pure: normalisation --------------------------------------------------------------------------------------------------
assert.equal(normalizeDate('2026-11-01'), '2026-11-01');
assert.equal(normalizeDate('01/11/2026'), '2026-11-01', 'day-first');
assert.equal(normalizeDate('1 November 2026'), '2026-11-01');
assert.equal(normalizeDate('November 1, 2026'), '2026-11-01');
assert.equal(normalizeDate('١/١١/٢٠٢٦'), '2026-11-01', 'Arabic digits');
assert.equal(normalizeDate('31/02/2026'), null, 'not a real day');
assert.equal(normalizeDate('soon'), null);
assert.equal(isAmbiguousDate('03/04/2026'), true);
assert.equal(isAmbiguousDate('13/04/2026'), false);
assert.equal(normalizeNumber('1,234.50'), 1234.5);
assert.equal(normalizeNumber('1.234,50'), 1234.5);
assert.equal(normalizeNumber('1,234'), 1234);
assert.equal(normalizeNumber('٣٥٠٫٥'), 350.5);
assert.equal(normalizeNumber('abc'), null);
assert.deepEqual(normalizeCurrency('EGP 12,500.00'), { amount: 12500, currency: 'EGP' });
assert.deepEqual(normalizeCurrency('12,500 جنيه'), { amount: 12500, currency: 'EGP' });
assert.deepEqual(normalizeCurrency('$ 99'), { amount: 99, currency: 'USD' });
assert.deepEqual(normalizeCurrency('4500'), { amount: 4500, currency: null });
assert.equal(normalizeNationalId('2 9001 01 0112345'.replace(/ /g, '')), '29001010112345');
assert.equal(normalizeNationalId('123'), null);
assert.equal(latinDigits('٠١٢'), '012');

// ---- pure: reminder dates ---------------------------------------------------------------------------------------------------
// Cairo is UTC+2 in winter (no DST from 2025 on... but the engine must follow the zone database, so compare with Intl).
const cairo = (d: string, t: string) => zonedToUtc(d, t, 'Africa/Cairo');
const local = (dt: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(dt);
{
  const timing = { offsets: [{ amount: 30, unit: 'days' as const, direction: 'before' as const }, { amount: 7, unit: 'days' as const, direction: 'before' as const }, { amount: 1, unit: 'days' as const, direction: 'before' as const }], time: '09:00', timezone: 'Africa/Cairo' };
  const occ = occurrences(timing, '2026-11-01');
  assert.deepEqual(occ.map((o) => local(o.dueAt, 'Africa/Cairo')), ['2026-10-02, 09:00', '2026-10-25, 09:00', '2026-10-31, 09:00'], 'example from the brief: 30, 7 and 1 day before 1 November');
  assert.equal(occ.length, 3);
}
// daylight saving: 09:00 New York stays 09:00 local on both sides of the change (UTC hour moves)
const nyBefore = zonedToUtc('2026-03-07', '09:00', 'America/New_York'); const nyAfter = zonedToUtc('2026-03-09', '09:00', 'America/New_York');
assert.equal(nyBefore.toISOString(), '2026-03-07T14:00:00.000Z'); assert.equal(nyAfter.toISOString(), '2026-03-09T13:00:00.000Z');
// a reminder 3 days before 10 March crosses the change and still shows 09:00 local
assert.equal(local(applyOffset('2026-03-10', { amount: 3, unit: 'days', direction: 'before' }, '09:00', 'America/New_York'), 'America/New_York'), '2026-03-07, 09:00');
// a time that does not exist (02:30 on the spring-forward day) lands after the gap, never before it
assert.ok(zonedToUtc('2026-03-08', '02:30', 'America/New_York').getTime() >= Date.parse('2026-03-08T07:00:00Z'));
assert.equal(addMonthsIso('2026-03-31', -1), '2026-02-28', 'month end clamps');
assert.equal(addMonthsIso('2026-01-31', 1), '2026-02-28');
assert.equal(addMonthsIso('2026-11-15', 3), '2027-02-15');
assert.equal(local(applyOffset('2026-11-01', { amount: 2, unit: 'months', direction: 'before' }, '09:00', 'Africa/Cairo'), 'Africa/Cairo'), '2026-09-01, 09:00');
assert.equal(local(applyOffset('2026-11-01', { amount: 2, unit: 'weeks', direction: 'before' }, '09:00', 'Africa/Cairo'), 'Africa/Cairo'), '2026-10-18, 09:00');
assert.equal(applyOffset('2026-11-01', { amount: 3, unit: 'hours', direction: 'before' }, '09:00', 'UTC').toISOString(), '2026-11-01T06:00:00.000Z');
assert.equal(applyOffset('2026-11-01', { amount: 30, unit: 'minutes', direction: 'after' }, '09:00', 'UTC').toISOString(), '2026-11-01T09:30:00.000Z');
assert.equal(applyOffset('2026-11-01', { amount: 2, unit: 'days', direction: 'after' }, '09:00', 'UTC').toISOString(), '2026-11-03T09:00:00.000Z');
{ // recurrence: a "before" reminder repeats weekly until the target moment, never past it
  const occ = occurrences({ offsets: [{ amount: 21, unit: 'days', direction: 'before' }], recurring: { every: 1, unit: 'weeks' }, time: '09:00', timezone: 'UTC' }, '2026-11-01');
  assert.deepEqual(occ.map((o) => o.dueAt.toISOString().slice(0, 10)), ['2026-10-11', '2026-10-18', '2026-10-25']);
  const after = occurrences({ offsets: [{ amount: 1, unit: 'days', direction: 'after' }], recurring: { every: 2, unit: 'days', max: 3 }, time: '09:00', timezone: 'UTC' }, '2026-11-01');
  assert.deepEqual(after.map((o) => o.dueAt.toISOString().slice(0, 10)), ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-08']);
}

// ---- pure: lifecycle -------------------------------------------------------------------------------------------------------
assert.equal(canTransition('uploaded', 'approved'), false, 'upload never jumps to approved');
assert.equal(canTransition('processing', 'approved'), false, 'extraction cannot approve');
assert.equal(canTransition('pending_review', 'approved'), true);
assert.equal(canTransition('archived', 'active'), false);
assert.equal(canTransition('extraction_failed', 'processing'), true);
const ev = (status: any, expiryDate: string | null, today: string, startDate: string | null = null) => evaluateStatus({ status, expiryDate, startDate, today, expiringSoonDays: 30 });
assert.equal(ev('approved', '2026-11-01', '2026-09-01'), 'active');
assert.equal(ev('active', '2026-11-01', '2026-10-02'), 'expiring_soon', '30 days before');
assert.equal(ev('active', '2026-11-01', '2026-10-01'), 'active');
assert.equal(ev('expiring_soon', '2026-11-01', '2026-11-01'), 'expiring_soon', 'still valid on the expiry date');
assert.equal(ev('expiring_soon', '2026-11-01', '2026-11-02'), 'expired');
assert.equal(ev('approved', null, '2026-11-02'), 'active', 'no expiry date: never expires');
assert.equal(ev('approved', '2027-01-01', '2026-11-02', '2026-12-01'), 'approved', 'not started yet');
assert.equal(ev('pending_review', '2020-01-01', '2026-11-02'), 'pending_review', 'unapproved data never drives status');
assert.equal(ev('archived', '2020-01-01', '2026-11-02'), 'archived');

// ---- pure: field schemas ----------------------------------------------------------------------------------------------------
{
  const bad = validateFieldDefs([{ key: 'Bad Key', label: 'x', type: 'text' }, { key: 'a', label: 'A', type: 'nope' }, { key: 'd', label: 'D', type: 'text', role: 'expiry_date' }, { key: 'c', label: 'C', type: 'select' }]);
  assert.ok(bad.errors['fields.0.key'] && bad.errors['fields.1.type'] && bad.errors['fields.2.role'] && bad.errors['fields.3.options']);
  const good = validateFieldDefs([{ key: 'start', label: 'Start', type: 'date', role: 'start_date', required: true }, { key: 'finish', label: 'End', type: 'date', role: 'end_date' }, { key: 'nid', label: 'ID', type: 'text', format: 'national_id', sensitive: true }]);
  assert.deepEqual(good.errors, {});
  const v = validateValues(good.fields, { start: '2026-05-01', finish: '2026-04-01', nid: '123' });
  assert.ok(v.errors.finish?.[0].includes('before the start') && v.errors.nid);
  assert.deepEqual(validateValues(good.fields, { finish: '2026-04-01' }).errors.start, ['Required.']);
  assert.deepEqual(validateValues(good.fields, { start: '2026-05-01', nid: '29001010112345' }).errors, {});
}
{ // quote location and keyword detection
  const page = buildPage(1, 600, 800, [{ str: 'Contract No:', x: 50, y: 700, width: 80, height: 12 }, { str: 'C-100', x: 140, y: 700, width: 40, height: 12 }, { str: 'Expiry', x: 50, y: 650, width: 40, height: 12 }, { str: '2026-11-01', x: 95, y: 650, width: 60, height: 12 }]);
  const hit = locate([page], 'Expiry 2026-11-01', 1);
  assert.equal(hit?.page, 1); assert.ok(hit?.bbox && hit.bbox.x > 0 && hit.bbox.y > 0 && hit.bbox.width <= 1);
  assert.equal(locate([page], 'not in the page'), null);
  const types = [{ key: 'contract', label: 'C', keywords: ['contract', 'agreement'], fields: [] }, { key: 'invoice', label: 'I', keywords: ['invoice', 'total'], fields: [] }];
  (globalThis as any).__keywordCheck = () => { return { types }; };
}
console.log('docs-smoke: pure checks passed');

// ---- database and HTTP -------------------------------------------------------------------------------------------------------
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Types } from 'mongoose';
const storage = await mkdtemp(join(tmpdir(), 'docs-smoke-'));
process.env.DOCS_STORAGE_DIR = storage;
process.env.DOCS_MAX_UPLOAD_MB = '1';
const mem = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGODB_URI = mem.getUri('accounting');
const { connectDb, disconnectDb } = await import('../db/connection.js');
const { createApp } = await import('../app.js');
const { seed } = await import('./seed.js');
const m = await import('../docs/models.js');
const { Organization, Role, User } = await import('../models/index.js');
const { Notification } = await import('../core/workflow.models.js');
const { roleMatrix } = await import('../db/permissions.js');
const { hashPassword } = await import('../auth/password.js');
const { setAiProvider, AiError } = await import('../docs/extraction/ai.js');
const { setOcrProvider } = await import('../docs/extraction/ocr.js');
const { setMailer } = await import('../docs/mailer.js');
const { processJobs } = await import('../docs/jobs.js');
const { processDueReminders, sweepStatuses, tick } = await import('../docs/reminders.service.js');
const { verifyChain } = await import('../db/audit-chain.js');
{ // keyword detection (the pipeline module reads the environment, so it loads after the test environment is set)
  const { detectByKeywords } = await import('../docs/extraction/pipeline.js');
  const { types } = (globalThis as any).__keywordCheck();
  assert.equal(detectByKeywords('This contract is an agreement', types).key, 'contract');
  assert.equal(detectByKeywords('hello world', types).key, null, 'no match is no answer');
  assert.equal(detectByKeywords('contract invoice', types).key, null, 'a tie is no answer');
}
await connectDb();
const { password, org } = await seed();
const server = createApp().listen(0);
const base = `http://localhost:${(server.address() as { port: number }).port}`;

class Client {
  jar = new Map<string, string>();
  async raw(method: string, path: string, body?: BodyInit, json = true) {
    const x = this.jar.get('XSRF-TOKEN');
    const res = await fetch(base + path, { method, headers: { ...(json ? { 'content-type': 'application/json' } : {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(x && { 'x-xsrf-token': x }) }, body });
    for (const c of res.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); this.jar.set(k, v); }
    return res;
  }
  async call(method: string, path: string, body?: unknown) {
    const res = await this.raw(method, path, body === undefined ? undefined : JSON.stringify(body));
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }
  async upload(path: string, file: Uint8Array | null, fields: Record<string, string> = {}, name = 'doc.pdf', method = 'POST') {
    const f = new FormData();
    if (file) f.append('file', new Blob([file as BlobPart], { type: 'application/pdf' }), name);
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    const res = await this.raw(method, path, f, false);
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  }
  static async login(email: string, pw: string) {
    const c = new Client();
    await c.call('GET', '/sanctum/csrf-cookie');
    assert.equal((await c.call('POST', '/api/v1/auth/login', { email, password: pw })).status, 200, email);
    return c;
  }
  static as = (role: string) => Client.login(`demo.${role}@demo.test`, password);
}

// ---- helpers: PDFs ---------------------------------------------------------------------------------------------------------
async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([600, 800]); lines.forEach((l, i) => p.drawText(l, { x: 50, y: 740 - i * 24, font, size: 13 }));
  return doc.save();
}
async function scannedPdf(lines: string[]): Promise<Uint8Array> {
  const canvas = createCanvas(900, 600); const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 900, 600); ctx.fillStyle = '#000'; ctx.font = '36px sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, 40, 80 + i * 60));
  const doc = await PDFDocument.create(); const img = await doc.embedPng(canvas.toBuffer('image/png'));
  doc.addPage([900, 600]).drawImage(img, { x: 0, y: 0, width: 900, height: 600 });
  return doc.save();
}
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');

// A pretend AI: reads "Label: value" lines. It also invents a value, to prove that ungrounded values are thrown away.
let aiCalls = 0; let aiFail: Error | null = null;
const fakeAi = {
  name: 'fake', model: 'fake-1',
  async classify(pages: Array<{ text: string }>) { aiCalls++; if (aiFail) throw aiFail; return { key: /contract/i.test(pages[0]?.text ?? '') ? 'contract' : null, confidence: 0.9 }; },
  async extract(pages: Array<{ page: number; text: string }>, fields: Array<{ key: string; label: string }>) {
    aiCalls++; if (aiFail) throw aiFail;
    return extractImpl(pages, fields);
  },
};
async function labelExtract(pages: Array<{ page: number; text: string }>, _fields: unknown) {
  {
    const out: Record<string, any> = {};
    const full = pages.map((p) => p.text).join(' ');
    const labels = ['Contract No', 'Party', 'Start Date', 'End Date', 'Value'];
    const take = (key: string, label: string) => {
      const at = full.indexOf(`${label}:`); if (at < 0) return;
      const from = at + label.length + 1;
      const ends = labels.map((l) => full.indexOf(`${l}:`, from)).filter((i) => i > 0);
      const value = full.slice(from, ends.length ? Math.min(...ends) : undefined).trim();
      if (value) out[key] = { value, quote: `${label}: ${value}`, page: 1, confidence: 0.92 };
    };
    take('number', 'Contract No'); take('party', 'Party'); take('start_date', 'Start Date'); take('end_date', 'End Date'); take('amount', 'Value');
    out.title = { value: 'Invented Title', quote: 'This sentence is not in the document', page: 1, confidence: 0.99 };   // hallucination
    out.payment_terms = { value: 'Net 90', quote: 'Payment: Net 90', page: 1 };                                          // hallucination (not in text)
    return { fields: out, notes: ['fake provider'] };
  }
}
let extractImpl: (pages: any, fields: any) => Promise<any> = labelExtract;
const sent: Array<{ to: string; subject: string }> = []; let mailFail = false;
setMailer({ async send(msg) { if (mailFail) return { ok: false, error: 'Mail could not be sent: ECONNREFUSED' }; sent.push({ to: msg.to, subject: msg.subject }); return { ok: true, messageId: `<${sent.length}@fake>` }; } });
setOcrProvider(null);
setAiProvider(fakeAi as never);

const D = '/api/v1/staff/docs';
const owner = await Client.as('owner');
const accountant = await Client.as('accountant');
const chief = await Client.as('chief_accountant');
const readOnly = await Client.as('read_only');
const hrUser = await Client.as('hr_payroll');

try {
  // ---- config and types -------------------------------------------------------------------------------------------------------
  const cfg = await owner.call('GET', `${D}/config`);
  assert.equal(cfg.status, 200); assert.equal(cfg.json.data.ai.configured, true); assert.equal(cfg.json.data.ocr.configured, false); assert.equal(cfg.json.data.mail.configured, true);
  const types = await owner.call('GET', `${D}/types`);
  assert.deepEqual(types.json.data.map((t: any) => t.key).sort(), ['contract', 'identity', 'invoice', 'license', 'other']);
  assert.equal((await readOnly.call('GET', `${D}/types`)).status, 200);

  // ---- upload: validation, storage, duplicates (1) ----------------------------------------------------------------------------
  const expiry = iso(120); const start = iso(-200);
  const lines = ['Service Contract', `Contract No: C-2026-017`, `Party: Nile Trading LLC`, `Start Date: ${start}`, `End Date: ${expiry}`, 'Value: EGP 12,500.00'];
  const pdf = await textPdf(lines);
  assert.equal((await readOnly.upload(`${D}/documents`, pdf)).status, 403, 'read-only cannot upload');
  assert.equal((await owner.upload(`${D}/documents`, null)).status, 422, 'no file');
  assert.equal((await owner.upload(`${D}/documents`, new TextEncoder().encode('hello'), {}, 'x.pdf')).status, 422, 'not a PDF by content');
  assert.equal((await owner.upload(`${D}/documents`, pdf, {}, 'x.exe')).status, 422, 'not a .pdf name');
  const evil = new TextEncoder().encode('%PDF-1.4\n1 0 obj<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>endobj\ntrailer<< /Root 1 0 R >>\n%%EOF');
  const refused = await owner.upload(`${D}/documents`, evil);
  assert.equal(refused.status, 422); assert.ok(refused.json.errors.file[0].includes('scripts'));
  const big = new Uint8Array(1_200_000); big.set(new TextEncoder().encode('%PDF-1.4')); assert.equal((await owner.upload(`${D}/documents`, big)).status, 413, 'too large');
  const up = await accountant.upload(`${D}/documents`, pdf, { typeKey: 'contract', title: 'Nile contract' });
  assert.equal(up.status, 201, JSON.stringify(up.json));
  const docId = up.json.data.id as string;
  assert.equal(up.json.data.status, 'uploaded'); assert.equal(up.json.data.extractionStatus, 'queued');
  assert.equal(await m.DocJob.countDocuments({ documentId: docId, status: 'queued' }), 1, 'processing was started');
  const v1 = await m.DocVersion.findOne({ documentId: docId });
  const { readFile } = await import('node:fs/promises');
  assert.deepEqual(new Uint8Array(await readFile(join(storage, v1!.storageKey))), pdf, 'the original is stored byte for byte');
  assert.equal(JSON.stringify(await m.DocDocument.findById(docId).lean()).includes('JVBER'), false, 'no base64 PDF inside MongoDB');
  const dup = await owner.upload(`${D}/documents`, pdf);
  assert.equal(dup.status, 409, 'same bytes are refused');
  assert.equal((await owner.upload(`${D}/documents`, pdf, { allowDuplicate: 'true' })).status, 201, 'unless the person insists');

  // ---- processing (2, 4, 5, 7) ------------------------------------------------------------------------------------------------
  const t0 = aiCalls;
  while (await processJobs(5)) { /* drain */ }
  const processed = await owner.call('GET', `${D}/documents/${docId}`);
  assert.equal(processed.json.data.status, 'pending_review', 'extraction never approves');
  assert.equal(processed.json.data.extractionStatus, 'succeeded');
  assert.deepEqual(processed.json.data.values, {}, 'nothing is approved yet');
  const ex = (await owner.call('GET', `${D}/documents/${docId}/extraction`)).json.data;
  assert.equal(ex.pages[0].method, 'embedded', 'text PDF needed no OCR');
  assert.equal(ex.provider.ocr, 'none');
  const f = (k: string) => ex.fields.find((x: any) => x.key === k);
  assert.equal(f('number').normalizedValue, 'C-2026-017'); assert.equal(f('number').state, 'extracted');
  assert.equal(f('party').normalizedValue, 'Nile Trading LLC');
  assert.equal(f('start_date').normalizedValue, start); assert.equal(f('end_date').normalizedValue, expiry);
  assert.deepEqual(f('amount').normalizedValue, { amount: 12500, currency: 'EGP' });
  assert.equal(f('end_date').confidence, 0.92); assert.equal(f('end_date').page, 1); assert.ok(f('end_date').sourceText.includes(expiry)); assert.ok(f('end_date').bbox.width > 0, 'bounding box located');
  assert.equal(f('title').state, 'not_found', 'an invented value is dropped'); assert.equal(f('title').normalizedValue, undefined);
  assert.equal(f('payment_terms').state, 'not_found', 'a value the text does not support stays empty');
  assert.equal(f('renewal_date').state, 'not_found', 'a field the document does not state stays empty');
  assert.ok(ex.steps.some((s: any) => s.name === 'embedded_text' && s.status === 'ok'), 'processing history is recorded');
  assert.ok(aiCalls > t0);
  assert.equal((await accountant.call('GET', `${D}/documents/${docId}/extraction/pages/1`)).status, 403, 'evidence page needs documents.review');
  assert.ok((await chief.call('GET', `${D}/documents/${docId}/extraction/pages/1`)).json.data.text.includes('Contract No'));

  // ---- review and approval (6) -------------------------------------------------------------------------------------------------
  assert.equal((await accountant.call('POST', `${D}/documents/${docId}/approve`, { values: {} })).status, 403, 'accountants do not approve');
  const noTitle = await chief.call('POST', `${D}/documents/${docId}/approve`, { values: { number: 'C-2026-017' } });
  assert.equal(noTitle.status, 422); assert.deepEqual(noTitle.json.errors.title, ['Required.'], 'required fields are enforced');
  assert.equal((await chief.call('PUT', `${D}/documents/${docId}/review`, { draft: { number: { decision: 'edited', value: 'C-2026-017/A' }, amount: { decision: 'rejected' } } })).status, 200, 'draft saved');
  const resumed = (await chief.call('GET', `${D}/documents/${docId}/extraction`)).json.data;
  assert.equal(resumed.draft.number.value, 'C-2026-017/A'); assert.equal(resumed.draft.amount.decision, 'rejected');
  const badDates = await chief.call('POST', `${D}/documents/${docId}/approve`, { values: { title: 'Nile contract', start_date: expiry, end_date: start } });
  assert.equal(badDates.status, 422); assert.ok(badDates.json.errors.end_date[0].includes('before the start'));
  const approved = await chief.call('POST', `${D}/documents/${docId}/approve`, { values: { title: 'Nile Service Contract', number: 'C-2026-017/A', party: 'Nile Trading LLC', start_date: start, end_date: expiry, renewal_date: iso(30) } });
  assert.equal(approved.status, 200, JSON.stringify(approved.json));
  assert.equal(approved.json.data.status, 'active'); assert.equal(approved.json.data.title, 'Nile Service Contract');
  assert.equal(approved.json.data.number, 'C-2026-017/A'); assert.equal(approved.json.data.expiryDate, expiry);
  assert.equal(approved.json.data.values.amount, undefined, 'a rejected value is not stored');
  const corr = (await m.DocExtraction.findOne({ documentId: docId }).sort({ createdAt: -1 }))!;
  assert.ok(corr.corrections.some((c: any) => c.key === 'number' && c.proposed === 'C-2026-017' && c.approved === 'C-2026-017/A'), 'manual corrections are recorded');
  assert.ok(corr.corrections.some((c: any) => c.key === 'amount' && c.approved === null));
  // AI must never overwrite approved data: run it again with a different answer
  extractImpl = async () => ({ fields: {}, notes: [] });
  assert.equal((await chief.call('POST', `${D}/documents/${docId}/extract`)).status, 202);
  while (await processJobs(5)) { /* drain */ }
  const again = await owner.call('GET', `${D}/documents/${docId}`);
  assert.equal(again.json.data.status, 'active', 'a new extraction does not reopen the document'); assert.equal(again.json.data.values.number, 'C-2026-017/A', 'approved values are untouched');

  // ---- sensitive fields and access (13) -----------------------------------------------------------------------------------------
  const idPdf = await textPdf(['National ID Card', 'Holder: Salma Demo', 'ID Number: 29001010112345']);
  const idUp = await owner.upload(`${D}/documents`, idPdf, { typeKey: 'identity', title: 'Salma ID' });
  while (await processJobs(5)) { /* drain */ }
  const idPending = (await owner.call('GET', `${D}/documents/${idUp.json.data.id}`)).json.data;
  assert.equal(idPending.status, 'pending_review');
  const idApprove = await owner.call('POST', `${D}/documents/${idUp.json.data.id}/approve`, { values: { title: 'Salma ID', holder: 'Salma Demo', national_id: '29001010112345', expiry_date: iso(400) } });
  assert.equal(idApprove.status, 200, JSON.stringify(idApprove.json));
  assert.equal((await owner.call('GET', `${D}/documents/${idUp.json.data.id}`)).json.data.values.national_id, '29001010112345', 'owner sees the sensitive field');
  assert.equal((await accountant.call('GET', `${D}/documents/${idUp.json.data.id}`)).json.data.values.national_id, undefined, 'accountant does not');
  const auditText = JSON.stringify(await (await import('../models/audit-event.js')).AuditEvent.find({ entityId: idUp.json.data.id }).lean());
  assert.equal(auditText.includes('29001010112345'), false, 'sensitive values never enter the audit trail');
  // restricted + employee documents
  const restricted = await owner.upload(`${D}/documents`, await textPdf(['Private memo']), { typeKey: 'other', visibility: 'restricted', title: 'Private' });
  assert.equal(restricted.status, 201);
  assert.equal((await accountant.call('GET', `${D}/documents/${restricted.json.data.id}`)).status, 404, 'restricted documents answer 404');
  assert.ok(!(await accountant.call('GET', `${D}/documents`)).json.data.some((d: any) => d.title === 'Private'), 'and are not listed');
  assert.ok((await owner.call('GET', `${D}/documents`)).json.data.some((d: any) => d.title === 'Private'));
  // downloads
  const dl = await accountant.raw('GET', `${D}/documents/${docId}/file`);
  assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition')!, /^attachment/); assert.equal(dl.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()), pdf, 'download returns the exact original');
  assert.equal((await readOnly.raw('GET', `${D}/documents/${docId}/file`)).status, 403, 'read-only lacks documents.download');
  const prev = await readOnly.raw('GET', `${D}/documents/${docId}/file?inline=1`);
  assert.equal(prev.status, 200); assert.match(prev.headers.get('content-disposition')!, /^inline/);
  // another office
  const other = await Organization.create({ name: 'Other Office' });
  await Role.create({ organizationId: other._id, name: 'owner', permissions: roleMatrix().owner });
  await User.create({ organizationId: other._id, name: 'Other Owner', email: 'other@other.test', passwordHash: await hashPassword('Other-Owner-Pass-123!'), type: 'staff', roles: ['owner'], emailVerifiedAt: new Date() });
  const stranger = await Client.login('other@other.test', 'Other-Owner-Pass-123!');
  assert.equal((await stranger.call('GET', `${D}/documents/${docId}`)).status, 404, 'tenant isolation');
  assert.equal((await stranger.call('GET', `${D}/documents`)).json.data.length, 0);
  assert.equal((await stranger.raw('GET', `${D}/documents/${docId}/file`)).status, 404);
  assert.equal((await stranger.call('POST', `${D}/documents/${docId}/approve`, { values: {} })).status, 404);
  assert.equal((await owner.call('GET', `${D}/documents/not-an-id`)).status, 404);
  assert.equal((await owner.call('PATCH', `${D}/types/contract`, { label: 'Hacked' })).status, 200);
  assert.equal((await stranger.call('GET', `${D}/types`)).json.data.find((t: any) => t.key === 'contract').label, 'Contract', 'types are per office');
  await owner.call('PATCH', `${D}/types/contract`, { label: 'Contract' });
  assert.equal((await accountant.call('PUT', `${D}/types/contract/fields`, { fields: [] })).status, 403);

  // ---- type and field administration -------------------------------------------------------------------------------------------
  const ct = (await owner.call('GET', `${D}/types/contract`)).json.data;
  const withCustom = [...ct.fields.map((x: any) => ({ ...x })), { key: 'site_manager', label: 'Site manager', type: 'text', required: false, active: true, order: 99 }];
  const putFields = await owner.call('PUT', `${D}/types/contract/fields`, { fields: withCustom });
  assert.equal(putFields.status, 200, JSON.stringify(putFields.json));
  assert.ok(putFields.json.data.fields.some((x: any) => x.key === 'site_manager'));
  const dropped = await owner.call('PUT', `${D}/types/contract/fields`, { fields: withCustom.filter((x: any) => x.key !== 'payment_terms') });
  assert.equal(dropped.json.data.fields.find((x: any) => x.key === 'payment_terms').active, false, 'a removed field is deactivated, not lost');
  assert.equal((await owner.call('PUT', `${D}/types/contract/fields`, { fields: [{ key: 'A b', label: 'x', type: 'text' }] })).status, 422);
  const newType = await owner.call('POST', `${D}/types`, { key: 'vehicle_license', label: 'Vehicle licence', fields: [{ key: 'plate', label: 'Plate', type: 'text', required: true }, { key: 'valid_until', label: 'Valid until', type: 'date', role: 'expiry_date' }] });
  assert.equal(newType.status, 201, JSON.stringify(newType.json));
  assert.equal((await owner.call('POST', `${D}/types`, { key: 'vehicle_license', label: 'x', fields: [] })).status, 422, 'duplicate key');

  // ---- reminders: calculation, delivery without a session, idempotency (8, 9, 10) -----------------------------------------------
  assert.equal((await accountant.call('POST', `${D}/reminder-rules`, {})).status, 403);
  const bad = await owner.call('POST', `${D}/reminder-rules`, { scope: 'global', name: 'x', dateField: 'expiry_date', offsets: [{ amount: -1, unit: 'years' }], recipients: {}, time: '25:00', timezone: 'Mars/Base' });
  assert.equal(bad.status, 422); for (const k of ['offsets.0.amount', 'offsets.0.unit', 'recipients', 'time', 'timezone']) assert.ok(bad.json.errors[k], k);
  const accUser = (await User.findOne({ email: 'demo.accountant@demo.test' }))!;
  const rule = await owner.call('POST', `${D}/reminder-rules`, {
    scope: 'type', typeKey: 'contract', name: 'Contract ending', dateField: 'end_date',
    offsets: [{ amount: 30, unit: 'days', direction: 'before' }, { amount: 7, unit: 'days', direction: 'before' }, { amount: 1, unit: 'days', direction: 'before' }],
    time: '09:00', timezone: 'Africa/Cairo', recipients: { owner: true, manager: true, users: [], roles: [] }, channels: { inApp: true, email: true },
    escalation: { afterHours: 24, roles: ['owner'], manager: false }, subject: 'Contract {title} ends {when}', message: '{title} — {label}\n{link}',
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.json));
  assert.equal(rule.json.meta.rescheduled, 1, 'existing documents were scheduled');
  const jobs = await m.DocReminderJob.find({ documentId: docId, kind: 'reminder' }).sort({ dueAt: 1 }).lean();
  assert.equal(jobs.length, 3);
  assert.deepEqual(jobs.map((j) => zonedLocal(j.dueAt)), [expiryMinus(30), expiryMinus(7), expiryMinus(1)].map((d) => `${d} 09:00`), 'due dates computed on the server in the office time zone');
  function zonedLocal(d: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(d).replace(',', ''); }
  function expiryMinus(n: number) { return new Date(Date.parse(expiry) - n * 86_400_000).toISOString().slice(0, 10); }
  assert.equal((await owner.call('GET', `${D}/documents/${docId}`)).json.data.reminderStatus, 'scheduled');
  assert.equal((await owner.call('GET', `${D}/reminders?days=200`)).json.data.length, 3);
  // no session is used from here: the scheduler works on its own. 10 minutes after the first reminder is due:
  const first = jobs[0].dueAt; const t1 = new Date(first.getTime() + 10 * 60_000);
  assert.equal(await processDueReminders(new Date(first.getTime() - 60_000)), 0, 'nothing is sent early');
  const [r1, r2] = await Promise.all([processDueReminders(t1), processDueReminders(t1)]);   // two workers racing
  assert.equal(r1 + r2, 1, 'the job is claimed once');
  const nOwner = await Notification.countDocuments({ kind: 'document_reminder' });
  const recipients = (await m.DocDelivery.find({ documentId: docId, channel: 'in_app' }).lean()).map((d) => String(d.userId));
  assert.equal(recipients.length, 2, 'the owner (uploader) and their manager were addressed'); assert.equal(nOwner, 2);
  assert.equal(sent.length, 2); assert.ok(sent.every((s) => s.subject.startsWith('Contract Nile Service Contract ends in 30 days')), sent[0]?.subject);
  assert.equal(await processDueReminders(t1), 0); assert.equal(await processDueReminders(new Date(t1.getTime() + 3600_000)), 0, 'a second pass sends nothing more');
  assert.equal(await Notification.countDocuments({ kind: 'document_reminder' }), 2); assert.equal(sent.length, 2);
  const sentJob = (await m.DocReminderJob.findOne({ _id: jobs[0]._id }).lean())!; assert.equal(sentJob.status, 'sent');
  assert.equal((await m.DocDelivery.find({ jobId: jobs[0]._id, channel: 'email', status: 'submitted' })).length, 2, 'e-mail is recorded as submitted only after the server accepted it');
  assert.equal((await owner.call('GET', `${D}/documents/${docId}`)).json.data.reminderStatus, 'partially_sent');
  const hist = await owner.call('GET', `${D}/notifications/history`);
  assert.ok(hist.json.data.length >= 4 && hist.json.data.every((h: any) => h.documentTitle === 'Nile Service Contract'));
  assert.ok((await accountant.call('GET', `${D}/notifications/history`)).json.data.every((h: any) => h.userId === String(accUser._id)), 'people see only their own history');
  // escalation: an unacknowledged reminder is escalated to the owner role a day later
  const esc = await m.DocReminderJob.findOne({ parentJobId: jobs[0]._id }).lean();
  assert.ok(esc && esc.kind === 'escalation' && esc.status === 'scheduled', 'escalation scheduled');
  const ownerUser = (await User.findOne({ email: 'demo.owner@demo.test' }))!;
  const escNow = new Date(esc!.dueAt.getTime() + 60_000);
  const notesBefore = await Notification.countDocuments({ kind: 'document_reminder' });
  assert.equal(await processDueReminders(escNow), 1, 'only the escalation is due');
  assert.equal((await m.DocReminderJob.findById(esc!._id).lean())!.status, 'sent');
  assert.equal(await Notification.countDocuments({ kind: 'document_reminder' }), notesBefore + 1, 'the owner role was told');
  assert.ok(await Notification.exists({ kind: 'document_reminder', userId: ownerUser._id, title: /^Not acknowledged/ }));
  // acknowledged in time: no escalation
  const t2 = new Date(jobs[1].dueAt.getTime() + 60_000);
  assert.equal(await processDueReminders(t2), 1);
  assert.equal((await accountant.call('POST', `${D}/reminders/${jobs[1]._id}/acknowledge`)).status, 200);
  const esc2 = (await m.DocReminderJob.findOne({ parentJobId: jobs[1]._id }).lean())!; assert.equal(esc2.status, 'cancelled');
  assert.equal((await readOnly.call('POST', `${D}/reminders/${jobs[1]._id}/acknowledge`)).status, 403, 'someone who was not notified cannot acknowledge');

  // ---- changing the date recalculates (11) -----------------------------------------------------------------------------------------
  const newExpiry = iso(200);
  const edit = await chief.call('PATCH', `${D}/documents/${docId}`, { values: { end_date: newExpiry } });
  assert.equal(edit.status, 200, JSON.stringify(edit.json)); assert.equal(edit.json.data.expiryDate, newExpiry);
  const afterEdit = await m.DocReminderJob.find({ documentId: docId, kind: 'reminder' }).lean();
  assert.equal(afterEdit.filter((j) => j.status === 'scheduled').length, 3, 'three new reminders');
  assert.ok(afterEdit.filter((j) => j.status === 'scheduled').every((j) => j.targetDate === newExpiry));
  assert.equal(afterEdit.filter((j) => j.status === 'cancelled').length, 1, 'the unsent reminder for the old date was cancelled');
  assert.equal(afterEdit.filter((j) => j.status === 'sent').length, 2, 'sent history is kept');
  assert.equal((await chief.call('PATCH', `${D}/documents/${docId}`, { values: { end_date: newExpiry } })).status, 200); // idempotent
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, kind: 'reminder' }), afterEdit.length, 'rescheduling twice creates no duplicates');
  // moving the date near and back again: reminders that were cancelled come back, nothing is duplicated
  assert.equal((await accountant.call('PATCH', `${D}/documents/${docId}`, { values: { end_date: iso(5) } })).status, 200, 'accountants hold documents.edit');
  assert.equal((await m.DocReminderJob.find({ documentId: docId, status: 'scheduled' }).lean()).every((j) => j.targetDate === iso(5)), true);
  assert.equal((await owner.call('GET', `${D}/documents/${docId}`)).json.data.status, 'expiring_soon', 'five days left');
  assert.equal((await chief.call('PATCH', `${D}/documents/${docId}`, { values: { end_date: newExpiry } })).status, 200);
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, status: 'scheduled', targetDate: newExpiry }), 3, 'the three reminders are back');
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, kind: 'reminder', targetDate: newExpiry }), 3, 'with no duplicates');
  assert.equal((await owner.call('GET', `${D}/documents/${docId}`)).json.data.status, 'active');

  // ---- renewal (12) ------------------------------------------------------------------------------------------------------------------
  assert.equal((await chief.call('POST', `${D}/documents/${docId}/renew`, {})).json.data.status, 'renewal_in_progress');
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, status: 'scheduled' }), 0, 'obsolete reminders are cancelled');
  assert.equal((await chief.call('POST', `${D}/documents/${docId}/complete-renewal`, { values: { end_date: iso(10) } })).status, 422, 'a renewal must move the date forward');
  const renewDate = iso(500);
  const renewed = await chief.call('POST', `${D}/documents/${docId}/complete-renewal`, { values: { end_date: renewDate } });
  assert.equal(renewed.status, 200, JSON.stringify(renewed.json)); assert.equal(renewed.json.data.status, 'active'); assert.equal(renewed.json.data.expiryDate, renewDate);
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, status: 'scheduled', targetDate: renewDate }), 3, 'reminders follow the new date');

  // ---- replacement and versions ------------------------------------------------------------------------------------------------------
  const pdf2 = await textPdf([...lines, 'Amendment 1']);
  assert.equal((await chief.upload(`${D}/documents/${docId}/versions`, pdf)).status, 409, 'an identical file is not a new version');
  const rep = await chief.upload(`${D}/documents/${docId}/versions`, pdf2);
  assert.equal(rep.status, 201, JSON.stringify(rep.json)); assert.equal(rep.json.data.status, 'processing'); assert.equal(rep.json.data.currentVersion, 2);
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, status: 'scheduled' }), 0, 'reminders pause until the new file is approved');
  const versions = (await owner.call('GET', `${D}/documents/${docId}/versions`)).json.data;
  assert.deepEqual(versions.map((v: any) => [v.version, v.current]), [[2, true], [1, false]]);
  const old = await owner.raw('GET', `${D}/documents/${docId}/file?version=1`);
  assert.deepEqual(new Uint8Array(await old.arrayBuffer()), pdf, 'earlier versions stay downloadable');
  extractImpl = async () => ({ fields: { end_date: { value: renewDate, quote: `End Date: ${expiry}`, page: 1 } }, notes: [] });
  while (await processJobs(5)) { /* drain */ }
  assert.equal((await owner.call('GET', `${D}/documents/${docId}`)).json.data.status, 'pending_review', 'the new file is reviewed again');
  const reapprove = await chief.call('POST', `${D}/documents/${docId}/approve`, { values: { title: 'Nile Service Contract', end_date: renewDate, start_date: start } });
  assert.equal(reapprove.status, 200); assert.equal(reapprove.json.data.status, 'active');
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: docId, status: 'scheduled' }), 3, 'and reminders resume');

  // ---- scanned PDFs and OCR (3) ---------------------------------------------------------------------------------------------------------
  const scanned = await scannedPdf(['Contract', 'End Date: 2027-03-01']);
  const sc1 = await owner.upload(`${D}/documents`, scanned, { typeKey: 'contract', title: 'Scanned, no OCR' });
  assert.equal(sc1.status, 201);
  while (await processJobs(5)) { /* drain */ }
  const scEx1 = (await owner.call('GET', `${D}/documents/${sc1.json.data.id}/extraction`)).json.data;
  assert.equal(scEx1.status, 'needs_ocr', 'without OCR a scanned page is reported, not faked'); assert.equal(scEx1.pages[0].method, 'none');
  assert.equal((await owner.call('GET', `${D}/documents/${sc1.json.data.id}`)).json.data.status, 'pending_review', 'manual entry is still possible');
  let ocrCalls = 0;
  setOcrProvider({ name: 'fake-ocr', async recognize(_b, pages) { ocrCalls++; return new Map(pages.map((p) => [p, 'Contract Contract No: S-9 End Date: 2027-03-01'])); } });
  extractImpl = async () => ({ fields: { end_date: { value: '2027-03-01', quote: 'End Date: 2027-03-01', page: 1 }, number: { value: 'S-9', quote: 'Contract No: S-9', page: 1 } }, notes: [] });
  const sc2 = await owner.upload(`${D}/documents`, await scannedPdf(['Contract again', 'End Date: 2027-03-01']), { typeKey: 'contract', title: 'Scanned, with OCR' });
  while (await processJobs(5)) { /* drain */ }
  const scEx2 = (await owner.call('GET', `${D}/documents/${sc2.json.data.id}/extraction`)).json.data;
  assert.equal(ocrCalls, 1, 'OCR ran for the scanned page only'); assert.equal(scEx2.pages[0].method, 'ocr'); assert.equal(scEx2.status, 'succeeded');
  assert.equal(scEx2.fields.find((x: any) => x.key === 'end_date').normalizedValue, '2027-03-01'); assert.equal(scEx2.fields.find((x: any) => x.key === 'end_date').bbox, undefined, 'OCR text has no coordinates');
  ocrCalls = 0;
  const textOnly = await owner.upload(`${D}/documents`, await textPdf(['Contract', 'plain text page with plenty of embedded text to read']), { typeKey: 'contract', title: 'Text page' });
  while (await processJobs(5)) { /* drain */ }
  assert.equal(ocrCalls, 0, 'a text PDF never goes to OCR'); void textOnly;
  setOcrProvider(null);

  // ---- no AI configured: honest state (10 of the brief) ----------------------------------------------------------------------------------
  setAiProvider(null);
  const noAi = await owner.upload(`${D}/documents`, await textPdf(['Service Contract', 'Contract No: Z-1 agreement between the parties', 'End Date: 2027-05-05']), { title: 'No AI' });
  while (await processJobs(5)) { /* drain */ }
  const naEx = (await owner.call('GET', `${D}/documents/${noAi.json.data.id}/extraction`)).json.data;
  assert.equal(naEx.status, 'text_only'); assert.ok(naEx.fields.every((x: any) => x.state === 'not_found'), 'no value is invented');
  assert.ok(naEx.notes.some((n: string) => n.includes('not configured'))); assert.equal(naEx.detectedType.method, 'keywords'); assert.equal(naEx.detectedType.key, 'contract');
  assert.equal((await owner.call('GET', `${D}/config`)).json.data.ai.configured, false);
  setAiProvider(fakeAi as never);

  // ---- failures can be diagnosed and retried (14) ----------------------------------------------------------------------------------------
  aiFail = new AiError('The AI service is busy (429).', true);
  const fail = await owner.upload(`${D}/documents`, await textPdf(['Contract', 'will fail']), { typeKey: 'contract', title: 'Will fail' });
  const failId = fail.json.data.id;
  let clock = new Date();
  for (let i = 0; i < 4; i++) { await processJobs(5, clock); clock = new Date(clock.getTime() + 3 * 3600_000); }
  const failed = (await owner.call('GET', `${D}/documents/${failId}`)).json.data;
  assert.equal(failed.status, 'extraction_failed'); assert.equal(failed.extractionStatus, 'failed');
  const failJob = (await m.DocJob.findOne({ documentId: failId }).lean())!; assert.equal(failJob.status, 'failed'); assert.equal(failJob.attempts, 3, 'retried with backoff, then gave up'); assert.ok(failJob.lastError?.includes('busy'));
  const hx = (await owner.call('GET', `${D}/documents/${failId}/history`)).json.data;
  assert.ok(hx.events.some((e: any) => e.action === 'extraction_failed') && hx.extractions.every((x: any) => x.status === 'failed'), 'history shows what failed');
  aiFail = null;
  assert.equal((await owner.call('POST', `${D}/documents/${failId}/extract`)).status, 202, 'retry');
  while (await processJobs(5)) { /* drain */ }
  assert.equal((await owner.call('GET', `${D}/documents/${failId}`)).json.data.status, 'pending_review');
  // a rejected key (401) fails at once and is not retried
  aiFail = new AiError('The AI service rejected the credentials.', false);
  const noRetry = await owner.upload(`${D}/documents`, await textPdf(['Contract', 'bad key']), { typeKey: 'contract', title: 'Bad key' });
  await processJobs(5);
  assert.equal((await m.DocJob.findOne({ documentId: noRetry.json.data.id }).lean())!.attempts, 1); aiFail = null;
  // manual entry after a failed extraction
  assert.equal((await owner.call('POST', `${D}/documents/${noRetry.json.data.id}/transition`, { to: 'pending_review' })).json.data.status, 'pending_review');
  assert.equal((await owner.call('POST', `${D}/documents/${failId}/transition`, { to: 'active' })).status, 422, 'invalid status changes are refused');
  assert.equal((await owner.call('POST', `${D}/documents/${failId}/approve`, { values: {} })).status, 422, 'required title missing');
  assert.equal((await owner.call('POST', `${D}/documents/${docId}/approve`, { values: {} })).status, 409, 'only a document waiting for review can be approved');

  // ---- mail failure: recorded, retried, never claimed as sent --------------------------------------------------------------------------------
  mailFail = true; sent.length = 0;
  const mailDoc = (await owner.upload(`${D}/documents`, await textPdf(['Mail contract']), { typeKey: 'contract', title: 'Mail doc' })).json.data.id;
  while (await processJobs(5)) { /* drain */ }
  assert.equal((await owner.call('POST', `${D}/documents/${mailDoc}/approve`, { values: { title: 'Mail doc', end_date: iso(2) } })).status, 200);
  const mj = await m.DocReminderJob.find({ documentId: mailDoc, status: 'scheduled' }).sort({ dueAt: 1 }).lean();
  assert.ok(mj.length >= 1, 'a near date still schedules the reminders that are in the future');
  const mjob = mj[0]; let mclock = new Date(mjob.dueAt.getTime() + 60_000);
  await processDueReminders(mclock);
  const dFail = await m.DocDelivery.findOne({ jobId: mjob._id, channel: 'email', status: 'failed' }).lean();
  assert.ok(dFail && dFail.error?.includes('ECONNREFUSED'), 'delivery failure and its error are recorded');
  assert.equal(await m.DocDelivery.countDocuments({ jobId: mjob._id, channel: 'in_app', status: 'submitted' }) > 0, true, 'in-app still delivered');
  assert.equal((await m.DocReminderJob.findById(mjob._id).lean())!.status, 'scheduled', 'the job waits for a retry'); assert.equal(sent.length, 0);
  mailFail = false;
  for (let i = 0; i < 3; i++) { mclock = new Date(mclock.getTime() + 8 * 3600_000); await processDueReminders(mclock); }
  assert.equal((await m.DocReminderJob.findById(mjob._id).lean())!.status, 'sent', 'the retry succeeds once mail works');
  const inAppForJob = await m.DocDelivery.countDocuments({ jobId: mjob._id, channel: 'in_app' });
  assert.equal(inAppForJob, 1, 'the retry did not notify in-app a second time (one recipient: the owner, who has no manager)');
  assert.equal(sent.length, 1, 'and the e-mail went out exactly once after the retry');
  // retry endpoint for a failed job
  await m.DocReminderJob.updateOne({ _id: mj[mj.length - 1]._id }, { status: 'failed', lastError: 'boom' });
  assert.equal((await owner.call('GET', `${D}/reminders?status=failed`)).json.data.length, 1, 'failed reminders can be listed');
  assert.equal((await accountant.call('POST', `${D}/reminders/${mj[mj.length - 1]._id}/retry`)).status, 403);
  assert.equal((await owner.call('POST', `${D}/reminders/${mj[mj.length - 1]._id}/retry`)).status, 200);

  // ---- expiry statuses from authoritative dates (6) -------------------------------------------------------------------------------------------
  const exp = (await owner.upload(`${D}/documents`, await textPdf(['Licence']), { typeKey: 'license', title: 'Licence' })).json.data.id;
  while (await processJobs(5)) { /* drain */ }
  const lic = await owner.call('POST', `${D}/documents/${exp}/approve`, { values: { title: 'Licence', expiry_date: iso(20) } });
  assert.equal(lic.json.data.status, 'expiring_soon', 'within the licence window of 60 days');
  await m.DocDocument.updateOne({ _id: exp }, { expiryDate: iso(-1), status: 'expiring_soon', 'values.expiry_date': iso(-1) });
  assert.ok(await sweepStatuses() >= 1);
  assert.equal((await owner.call('GET', `${D}/documents/${exp}`)).json.data.status, 'expired');
  assert.equal((await owner.call('POST', `${D}/documents/${exp}/transition`, { to: 'archived' })).json.data.status, 'archived');
  assert.equal(await m.DocReminderJob.countDocuments({ documentId: exp, status: 'scheduled' }), 0);
  assert.equal((await owner.call('PATCH', `${D}/documents/${exp}`, { title: 'x' })).status, 409, 'archived documents are read-only');
  const del = await owner.call('DELETE', `${D}/documents/${mailDoc}`); assert.equal(del.status, 204);
  assert.equal((await owner.call('GET', `${D}/documents/${mailDoc}`)).status, 404); assert.equal(await m.DocReminderJob.countDocuments({ documentId: mailDoc, status: 'scheduled' }), 0, 'deleting a document cancels its reminders');
  assert.equal((await accountant.call('DELETE', `${D}/documents/${docId}`)).status, 403);

  // ---- list, filters, dashboard (real data) ------------------------------------------------------------------------------------------------------
  const list = await owner.call('GET', `${D}/documents?status=active&sort=title&dir=asc&pageSize=2&page=1`);
  assert.equal(list.status, 200); assert.ok(list.json.meta.total >= 1 && list.json.data.length <= 2 && list.json.data.every((d: any) => d.status === 'active'));
  assert.ok((await owner.call('GET', `${D}/documents?q=nile`)).json.data.some((d: any) => d.title.includes('Nile')));
  assert.equal((await owner.call('GET', `${D}/documents?q=${encodeURIComponent('.*')}`)).json.meta.total, 0, 'search text is not a regular expression');
  assert.equal((await owner.call('GET', `${D}/dashboard`)).json.data.totals.upcomingReminders, 0, 'nothing is due in the next 30 days');
  const dash = (await owner.call('GET', `${D}/dashboard?reminderDays=365`)).json.data;
  assert.ok(dash.totals.total >= 6 && dash.totals.awaitingReview >= 1);
  const live = await m.DocReminderJob.countDocuments({ status: 'scheduled', kind: 'reminder', dueAt: { $lte: new Date(Date.now() + 365 * 86_400_000) }, documentId: { $in: (await m.DocDocument.find({ deletedAt: { $exists: false } }, { _id: 1 }).lean()).map((d) => d._id) } });
  assert.equal(dash.totals.upcomingReminders, live, 'the dashboard counts real scheduled jobs');
  assert.ok(dash.totals.total === (await m.DocDocument.countDocuments({ deletedAt: { $exists: false } })));
  assert.ok(dash.recentActivity.length > 0 && dash.upcomingExpiries.every((e: any) => e.daysLeft >= 0));
  assert.equal((await owner.call('GET', `${D}/dashboard?typeKey=nope`)).json.data.totals.total, 0, 'filters apply');
  assert.ok((await owner.call('GET', `${D}/dashboard?typeKey=contract`)).json.data.totals.total >= 3);

  // ---- tick does it all without a session, and audit stays intact -------------------------------------------------------------------------------------
  const t = await tick(new Date(Date.now() + 480 * 86_400_000)); assert.ok(t.swept >= 1 && t.reminders >= 1);
  { const bad = await verifyChain(org._id as Types.ObjectId); if (bad !== null) { const E = (await import('../models/audit-event.js')).AuditEvent; console.log(JSON.stringify(await E.find({ organizationId: org._id, seq: { $in: [bad - 1, bad, bad + 1] } }).lean())); } }
  assert.equal(await verifyChain(org._id as Types.ObjectId), null, 'the audit chain is intact');
  console.log('docs-smoke: all checks passed');
} finally {
  server.close(); setAiProvider(undefined); setOcrProvider(undefined); setMailer(undefined);
  await disconnectDb(); await mem.stop(); await rm(storage, { recursive: true, force: true });
}
