/**
 * Client-side upload checks. They give fast feedback only: the server repeats every one of them on its own
 * copy of the bytes and also runs the real malware scan and content validation, because anything a browser
 * sends can be forged. The mock API calls these same functions so the rules cannot drift apart.
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type FileProblem = 'empty' | 'tooLarge' | 'extension' | 'mime' | 'signature';

export interface FileKind {
  /** MIME types a browser may declare for this extension. */
  mimes: readonly string[];
}

export const ALLOWED_KINDS: Record<string, FileKind> = {
  pdf: { mimes: ['application/pdf'] },
  xlsx: { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] },
  // Browsers (notably on Windows with Excel installed) report CSV under several names.
  csv: { mimes: ['text/csv', 'application/csv', 'application/vnd.ms-excel'] },
  png: { mimes: ['image/png'] },
  jpg: { mimes: ['image/jpeg'] },
  jpeg: { mimes: ['image/jpeg'] },
};

export const ACCEPT_ATTRIBUTE = '.pdf,.xlsx,.csv,.png,.jpg,.jpeg';

/** How many leading bytes are read for the signature check. */
const HEAD_BYTES = 512;

const SIGNATURES: Record<string, readonly number[]> = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  // An .xlsx file is a ZIP container.
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpg: [0xff, 0xd8, 0xff],
  jpeg: [0xff, 0xd8, 0xff],
};

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Reads the first bytes of a blob with FileReader (no Blob.arrayBuffer, so it also works in older engines and jsdom). */
export function readHead(blob: Blob, length = HEAD_BYTES): Promise<Uint8Array> {
  return readBytes(blob.slice(0, length));
}

export function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** CSV has no magic number. Text must contain no NUL or other control bytes, which also rules out executables. */
function looksLikeText(head: Uint8Array): boolean {
  return head.every((b) => b === 0x09 || b === 0x0a || b === 0x0d || b >= 0x20);
}

export function matchesSignature(extension: string, head: Uint8Array): boolean {
  if (extension === 'csv') return head.length > 0 && looksLikeText(head);
  const signature = SIGNATURES[extension];
  return !!signature && signature.every((byte, i) => head[i] === byte);
}

/** Checks size, extension, declared MIME type and the first bytes. Returns the first problem, or null when the file passes. */
export async function checkFile(file: Blob, name: string = (file as File).name): Promise<FileProblem | null> {
  if (file.size === 0) return 'empty';
  if (file.size > MAX_FILE_BYTES) return 'tooLarge';
  const extension = extensionOf(name);
  const kind = ALLOWED_KINDS[extension];
  if (!kind) return 'extension';
  if (!kind.mimes.includes(file.type)) return 'mime';
  return matchesSignature(extension, await readHead(file)) ? null : 'signature';
}

/** SHA-256 of the content as lowercase hex, or undefined where Web Crypto is unavailable (insecure context). */
export async function sha256Hex(blob: Blob): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', (await readBytes(blob)) as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
