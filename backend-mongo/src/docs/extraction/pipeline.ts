import { env } from '../../config/env.js';
import { coerce } from '../fields.js';
import type { DocFieldDef } from '../models.js';
import { isAmbiguousDate } from '../normalize.js';
import { AiError, aiProvider, type AiProvider } from './ai.js';
import { locate } from './locate.js';
import { ocrProvider } from './ocr.js';
import { PdfError, collapse, extractEmbedded, looksScanned, precheck, type PageText } from './pdf.js';

export interface TypeInfo { key: string; label: string; keywords: string[]; fields: DocFieldDef[] }
export interface Step { name: string; status: 'ok' | 'skipped' | 'failed'; detail?: string; at: Date; ms: number }
export interface FieldResult {
  key: string; state: 'extracted' | 'not_found' | 'invalid'; rawValue?: unknown; normalizedValue?: unknown; confidence?: number;
  page?: number; sourceText?: string; bbox?: { x: number; y: number; width: number; height: number }; issues: string[];
}
export interface PipelineResult {
  status: 'succeeded' | 'text_only' | 'needs_ocr' | 'failed';
  pageCount: number;
  pages: Array<{ page: number; text: string; method: 'embedded' | 'ocr' | 'none'; chars: number }>;
  detectedType: { key: string | null; confidence: number; method: 'user' | 'ai' | 'keywords' | 'none' };
  typeKey: string;
  fields: FieldResult[];
  steps: Step[];
  notes: string[];
  provider: { text: string; ocr: string; ai: string; model: string };
  error?: string;
}

export interface PipelineInput { bytes: Buffer; types: TypeInfo[]; typeKey?: string | null; fallbackKey: string }

const MAX_TEXT_PER_PAGE = 20_000;

/** Keyword scoring: a transparent fallback when no AI is configured. Needs at least two distinct hits and a clear winner. */
export function detectByKeywords(text: string, types: TypeInfo[]): { key: string | null; confidence: number } {
  const hay = text.toLowerCase();
  const scored = types.map((t) => ({ key: t.key, hits: new Set(t.keywords.filter((k) => k && hay.includes(k.toLowerCase()))).size })).sort((a, b) => b.hits - a.hits);
  const [a, b] = scored;
  if (!a || a.hits < 2 || (b && b.hits === a.hits)) return { key: null, confidence: 0 };
  return { key: a.key, confidence: Math.min(0.85, a.hits / 6) };
}

const mask = (s: string): string => s.replace(/\d[\d\s-]{7,}\d/g, (m) => '#'.repeat(Math.min(m.length, 14)));

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const steps: Step[] = [];
  const notes: string[] = [];
  const ai = aiProvider();
  const ocr = ocrProvider();
  const provider = { text: 'pdfjs', ocr: ocr?.name ?? 'none', ai: ai?.name ?? 'none', model: ai?.model ?? '' };
  const base = (): PipelineResult => ({ status: 'failed', pageCount: 0, pages: [], detectedType: { key: null, confidence: 0, method: 'none' }, typeKey: input.typeKey ?? input.fallbackKey, fields: [], steps, notes, provider });
  const time = async <T>(name: string, fn: () => Promise<{ value: T; status?: Step['status']; detail?: string }>): Promise<T> => {
    const t0 = Date.now(); const at = new Date();
    try { const r = await fn(); steps.push({ name, status: r.status ?? 'ok', detail: r.detail, at, ms: Date.now() - t0 }); return r.value; }
    catch (e) { steps.push({ name, status: 'failed', detail: (e as Error).message, at, ms: Date.now() - t0 }); throw e; }
  };

  // 1-2. validate and read embedded text
  let pages: PageText[];
  try {
    await time('validate', async () => { precheck(input.bytes, env.docs.maxUploadMb * 1_048_576); return { value: null }; });
    const parsed = await time('embedded_text', async () => { const p = await extractEmbedded(input.bytes, env.docs.maxPages); return { value: p, detail: `${p.pageCount} page(s)` }; });
    pages = parsed.pages;
  } catch (e) {
    const r = base(); r.error = e instanceof PdfError ? e.message : 'The PDF could not be processed.'; return r;
  }

  // 3. scanned pages: OCR when configured, otherwise say so
  const method = new Map<number, 'embedded' | 'ocr' | 'none'>(pages.map((p) => [p.page, looksScanned(p) ? 'none' : 'embedded']));
  const scanned = pages.filter((p) => method.get(p.page) === 'none').map((p) => p.page);
  if (scanned.length) {
    if (!ocr) {
      steps.push({ name: 'ocr', status: 'skipped', detail: `${scanned.length} scanned page(s); OCR is not configured`, at: new Date(), ms: 0 });
      notes.push(`${scanned.length} page(s) look scanned and OCR is not configured, so their text was not read.`);
    } else {
      try {
        const got = await time('ocr', async () => ({ value: await ocr.recognize(input.bytes, scanned, env.docs.maxPages), detail: `${scanned.length} page(s)` }));
        for (const [n, text] of got) {
          const page = pages.find((p) => p.page === n)!;
          page.text = collapse(text); page.items = [];
          method.set(n, page.text ? 'ocr' : 'none');
        }
      } catch (e) {
        notes.push(`OCR failed: ${(e as Error).message}`);
      }
    }
  }

  const outPages = pages.map((p) => ({ page: p.page, text: p.text.slice(0, MAX_TEXT_PER_PAGE), method: method.get(p.page) ?? 'none', chars: p.text.length }));
  const readable = pages.filter((p) => p.text.replace(/\s/g, '').length > 0);
  const result: PipelineResult = { ...base(), pageCount: pages.length, pages: outPages };
  if (!readable.length) {
    result.status = scanned.length && !ocr ? 'needs_ocr' : 'failed';
    result.error = scanned.length && !ocr ? undefined : 'No text could be read from the PDF.';
    return result;
  }

  // 4. document type
  const known = new Set(input.types.map((t) => t.key));
  const joined = readable.slice(0, 3).map((p) => p.text).join('\n');
  let detected: PipelineResult['detectedType'] = { key: null, confidence: 0, method: 'none' };
  if (input.typeKey && known.has(input.typeKey)) detected = { key: input.typeKey, confidence: 1, method: 'user' };
  else if (ai) {
    const c = await time('detect_type', async () => ({ value: await ai.classify(readable.map((p) => ({ page: p.page, text: env.docs.aiRedactSensitive ? mask(p.text) : p.text })), input.types.filter((t) => t.key !== 'other')) })).catch((e) => { if (e instanceof AiError && e.retryable) throw e; notes.push(`Type detection failed: ${(e as Error).message}`); return { key: null, confidence: 0 }; });
    if (c.key) detected = { key: c.key, confidence: c.confidence, method: 'ai' };
  }
  if (!detected.key) {
    const k = detectByKeywords(joined, input.types);
    steps.push({ name: 'detect_type_keywords', status: k.key ? 'ok' : 'skipped', detail: k.key ?? 'no clear match', at: new Date(), ms: 0 });
    if (k.key) detected = { key: k.key, confidence: k.confidence, method: 'keywords' };
  }
  result.detectedType = detected;
  const typeKey = detected.key && known.has(detected.key) ? detected.key : input.fallbackKey;
  result.typeKey = typeKey;
  const type = input.types.find((t) => t.key === typeKey);
  const fields = (type?.fields ?? []).filter((f) => f.active).sort((a, b) => a.order - b.order);
  result.fields = fields.map((f) => ({ key: f.key, state: 'not_found', issues: [] }));

  // 5-7. AI extraction, grounding, normalisation, validation
  if (!ai) {
    result.status = 'text_only';
    notes.push('AI extraction is not configured. The text was read and the fields are left empty for manual entry.');
    steps.push({ name: 'ai_extract', status: 'skipped', detail: 'not configured', at: new Date(), ms: 0 });
    return result;
  }
  const redact = env.docs.aiRedactSensitive;
  const asked = redact ? fields.filter((f) => !f.sensitive) : fields;
  const sent = readable.map((p) => ({ page: p.page, text: redact ? mask(p.text) : p.text }));
  const out = await time('ai_extract', async () => ({ value: await ai.extract(sent, asked, type?.label ?? typeKey), detail: `${asked.length} field(s), model ${ai.model}` }));
  for (const n of out.notes ?? []) notes.push(n);

  result.fields = fields.map((def): FieldResult => {
    const got = out.fields[def.key];
    const nf: FieldResult = { key: def.key, state: 'not_found', issues: [] };
    if (!got || got.value === null || got.value === undefined || String(got.value).trim() === '') return nf;
    const raw = typeof got.value === 'object' ? JSON.stringify(got.value) : String(got.value);
    const quote = typeof got.quote === 'string' ? got.quote : '';
    const hit = quote ? locate(pages.filter((p) => p.text), quote, typeof got.page === 'number' ? got.page : undefined) : null;
    const pageText = hit ? pages.find((p) => p.page === hit.page)?.text.toLowerCase() ?? '' : '';
    // Grounding: the evidence must be in the document AND must contain the value. Otherwise the value is not used.
    if (!hit || !pageText.includes(collapse(raw).toLowerCase())) return { ...nf, issues: ['The AI proposed a value that the document text does not support, so it was not used.'] };
    const { value, issues } = coerce(def, raw);
    const r: FieldResult = { key: def.key, state: value === null ? 'invalid' : 'extracted', rawValue: raw, normalizedValue: value, page: hit.page, sourceText: collapse(quote).slice(0, 400), bbox: hit.bbox, issues: [...issues] };
    if (typeof got.confidence === 'number') r.confidence = Math.max(0, Math.min(1, got.confidence));
    if (def.type === 'date' && isAmbiguousDate(raw)) { r.issues.push('Day and month could be read either way. Check the date.'); if (r.confidence !== undefined) r.confidence = Math.min(r.confidence, 0.6); }
    return r;
  });
  result.status = 'succeeded';
  return result;
}

export type { AiProvider };
