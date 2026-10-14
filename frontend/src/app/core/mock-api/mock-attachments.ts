import { Attachment } from '../../features/tax/tax.models';
import { FileProblem, checkFile, sha256Hex } from '../../features/documents/file-validation';
import { MockMessageKey } from './mock-messages';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, invalid } from './mock-types';

const FILE_ERROR: Record<FileProblem, MockMessageKey> = { empty: 'fileEmpty', tooLarge: 'fileTooLarge', extension: 'fileType', mime: 'fileMime', signature: 'fileSignature' };

/**
 * Server-side checks on an uploaded file, the same functions the documents module uses (size, extension, declared
 * type and the first bytes). The malware scan the real server would run cannot be done in the mock.
 */
export async function fileProblem(file: unknown, missing: MockMessageKey = 'required'): Promise<MockResult | null> {
  if (!(file instanceof Blob)) return invalid({ file: [missing] });
  const problem = await checkFile(file, file instanceof File ? file.name : '');
  return problem ? invalid({ file: [FILE_ERROR[problem]] }) : null;
}

/** Stores a validated file in the compliance blob store and returns its metadata. */
export async function storeAttachment(ctx: LedgerCtx, owner: string, file: File, name: string): Promise<Attachment> {
  const id = ctx.store.compliance.nextId('att');
  const sha256 = await sha256Hex(file);
  ctx.store.compliance.blobs.set(`${owner}:${id}`, file);
  return { id, name: name || file.name, fileName: file.name, mimeType: file.type, sizeBytes: file.size, ...(sha256 ? { sha256 } : {}), uploadedBy: ctx.user.profile.name, uploadedAt: new Date().toISOString() };
}
