import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfRoot = dirname(require.resolve('pdfjs-dist/package.json'));
export const PDF_OPTIONS = {
  standardFontDataUrl: join(pdfRoot, 'standard_fonts') + '/',
  cMapUrl: join(pdfRoot, 'cmaps') + '/',
  cMapPacked: true,
  isEvalSupported: false,
  useSystemFonts: false,
  verbosity: 0,
} as const;

export class PdfError extends Error {
  constructor(public code: 'not_pdf' | 'too_large' | 'encrypted' | 'active_content' | 'corrupt' | 'too_many_pages', message: string) { super(message); }
}

const MAGIC = Buffer.from('%PDF-');

/**
 * Cheap checks done before anything parses the file. The bytes are never changed: the original is stored exactly as uploaded.
 * Files that can run code or open other programs are refused; they have no place in an accounting office's records.
 */
export function precheck(bytes: Buffer, maxBytes: number): void {
  if (bytes.length === 0) throw new PdfError('corrupt', 'The file is empty.');
  if (bytes.length > maxBytes) throw new PdfError('too_large', `The file is larger than ${Math.round(maxBytes / 1_048_576)} MB.`);
  if (!bytes.subarray(0, 1024).includes(MAGIC)) throw new PdfError('not_pdf', 'The file is not a PDF.');
  // Raw scan: object streams can hide these names, so the parser-level check below covers the rest.
  const head = bytes.toString('latin1');
  if (/\/(JavaScript|JS|Launch|RichMedia)\b/.test(head)) throw new PdfError('active_content', 'The PDF contains scripts or launch actions and was refused.');
}

export interface TextItem { str: string; x: number; y: number; width: number; height: number }
export interface PageText {
  page: number; width: number; height: number;
  /** Whitespace-collapsed text of the page. */
  text: string;
  items: Array<TextItem & { start: number; end: number }>;
}

export interface Parsed { pageCount: number; pages: PageText[] }

export const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Builds a page's text in reading order with the character range of every item, so a quote can be mapped back to coordinates. */
export function buildPage(page: number, width: number, height: number, raw: TextItem[]): PageText {
  const items: PageText['items'] = [];
  let text = '';
  for (const it of raw) {
    const s = it.str.replace(/\s+/g, ' ');
    if (!s.trim()) continue;
    if (text && !text.endsWith(' ')) text += ' ';
    const start = text.length + (s.startsWith(' ') ? 1 : 0);
    text += s.trim();
    items.push({ ...it, start, end: text.length });
  }
  return { page, width, height, text: text.trim(), items };
}

export async function openPdf(bytes: Buffer, maxPages: number) {
  try {
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), ...PDF_OPTIONS });
    const pdf = await task.promise;
    if (pdf.numPages > maxPages) { await pdf.destroy(); throw new PdfError('too_many_pages', `The PDF has more than ${maxPages} pages.`); }
    return pdf;
  } catch (e) {
    if (e instanceof PdfError) throw e;
    const name = (e as { name?: string }).name;
    if (name === 'PasswordException') throw new PdfError('encrypted', 'The PDF is password protected.');
    throw new PdfError('corrupt', 'The PDF could not be read.');
  }
}

/** Embedded (selectable) text per page, with positions. Scanned pages come back with little or no text. */
export async function extractEmbedded(bytes: Buffer, maxPages: number): Promise<Parsed> {
  const pdf = await openPdf(bytes, maxPages);
  try {
    // Defence in depth: names inside compressed object streams are only visible to the parser.
    const js = await pdf.getJSActions().catch(() => null);
    if (js && Object.keys(js).length) throw new PdfError('active_content', 'The PDF contains scripts and was refused.');
    const pages: PageText[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const raw: TextItem[] = content.items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i)
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width, height: i.height || Math.abs(i.transform[3]) }));
      pages.push(buildPage(n, view.width, view.height, raw));
      page.cleanup();
    }
    return { pageCount: pdf.numPages, pages };
  } finally {
    await pdf.destroy();
  }
}

/** A page with fewer non-space characters than this is treated as an image (scanned) page. */
export const SCANNED_THRESHOLD = 25;
export const looksScanned = (p: PageText): boolean => p.text.replace(/\s/g, '').length < SCANNED_THRESHOLD;
