import { BadgeTone } from '../../shared/components/status-badge/status-badge';

export const REVIEW_TONE: Record<string, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger' };
export const EXPIRY_TONE: Record<string, BadgeTone> = { none: 'secondary', valid: 'success', expiring_soon: 'warning', expired: 'danger' };

/** Human-readable size using binary units, e.g. "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Hands a downloaded Blob to the browser as a file save. The temporary blob: URL never leaves this page. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}
