import { BadgeTone } from '../../shared/components/status-badge/status-badge';
import { DocStatus, ExtractionStatus, ReminderStatus } from './smart-docs.models';

export const STATUS_TONE: Record<DocStatus, BadgeTone> = {
  uploaded: 'secondary', processing: 'info', extraction_failed: 'danger', pending_review: 'warning', approved: 'success', active: 'success',
  expiring_soon: 'warning', expired: 'danger', renewal_in_progress: 'info', renewed: 'success', archived: 'secondary',
};
export const EXTRACTION_TONE: Record<ExtractionStatus, BadgeTone> = { none: 'secondary', queued: 'info', running: 'info', succeeded: 'success', text_only: 'warning', needs_ocr: 'warning', failed: 'danger' };
export const REMINDER_TONE: Record<ReminderStatus, BadgeTone> = { none: 'secondary', scheduled: 'info', partially_sent: 'info', completed: 'success', cancelled: 'secondary' };

/** Statuses in which the server is still working on the file, so a screen keeps asking. */
export const BUSY: readonly DocStatus[] = ['uploaded', 'processing'];
export const isBusy = (status: DocStatus, extraction: ExtractionStatus): boolean => BUSY.includes(status) || extraction === 'queued' || extraction === 'running';

export const formatBytes = (n: number): string => (n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1_048_576).toFixed(1)} MB`);

/** Client-side PDF checks: fast feedback only. The server repeats them on its own copy of the bytes. */
export type PdfProblem = 'empty' | 'tooLarge' | 'extension' | 'signature';
export async function checkPdf(file: File, maxBytes: number): Promise<PdfProblem | null> {
  if (file.size === 0) return 'empty';
  if (file.size > maxBytes) return 'tooLarge';
  if (!/\.pdf$/i.test(file.name)) return 'extension';
  const head = new Uint8Array(await readSlice(file.slice(0, 1024)));
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d];
  for (let i = 0; i + magic.length <= head.length; i++) if (magic.every((b, j) => head[i + j] === b)) return null;
  return 'signature';
}
function readSlice(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = () => reject(r.error); r.readAsArrayBuffer(blob); });
}
