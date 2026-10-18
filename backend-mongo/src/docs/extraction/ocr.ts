import { createCanvas } from '@napi-rs/canvas';
import { join, resolve } from 'node:path';
import { env } from '../../config/env.js';
import { openPdf } from './pdf.js';

export interface OcrProvider {
  readonly name: string;
  /** Pages (1-based) to text. A page that fails is simply absent from the result. */
  recognize(pdf: Buffer, pages: number[], maxPages: number): Promise<Map<number, string>>;
}

/** Report for the status screen: whether scanned pages can be read at all. */
export interface OcrState { provider: string; configured: boolean }

/** Renders each page with pdf.js and reads it with Tesseract. Language data is downloaded on first use unless DOCS_OCR_LANG_PATH holds it. */
export class TesseractOcr implements OcrProvider {
  readonly name = 'tesseract';
  async recognize(bytes: Buffer, pages: number[], maxPages: number): Promise<Map<number, string>> {
    const { createWorker } = await import('tesseract.js');
    // Downloaded language data is cached next to the stored files, not in whatever directory the server was started from.
    const worker = await createWorker(env.docs.ocrLangs, 1, { cachePath: join(resolve(env.docs.storageDir), '.ocr-cache'), ...(env.docs.ocrLangPath ? { langPath: env.docs.ocrLangPath } : {}) });
    const out = new Map<number, string>();
    const pdf = await openPdf(bytes, maxPages);
    try {
      for (const n of pages) {
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d') as never, viewport }).promise;
        const { data } = await worker.recognize(canvas.toBuffer('image/png'));
        out.set(n, data.text);
        page.cleanup();
      }
    } finally {
      await pdf.destroy();
      await worker.terminate();
    }
    return out;
  }
}

let override: OcrProvider | null | undefined;
/** Tests inject a provider; `null` forces "not configured". */
export const setOcrProvider = (p: OcrProvider | null | undefined): void => { override = p; };
export function ocrProvider(): OcrProvider | null {
  if (override !== undefined) return override;
  return env.docs.ocrProvider === 'tesseract' ? new TesseractOcr() : null;
}
export const ocrState = (): OcrState => ({ provider: ocrProvider()?.name ?? 'none', configured: ocrProvider() !== null });
