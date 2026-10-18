import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';

/** Where original files live. MongoDB keeps only the key. An S3 or MinIO store implements the same interface. */
export interface FileStore {
  put(organizationId: string, bytes: Buffer): Promise<string>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Readable;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

export class LocalFileStore implements FileStore {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  /** Keys are generated here, never taken from a client; the check stops a key from leaving the root all the same. */
  private path(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error('Invalid storage key.');
    return full;
  }

  async put(organizationId: string, bytes: Buffer): Promise<string> {
    const key = join(organizationId, randomBytes(16).toString('hex') + '.pdf');
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, bytes, { flag: 'wx', mode: 0o600 });
    return key;
  }
  get(key: string): Promise<Buffer> { return readFile(this.path(key)); }
  stream(key: string): Readable { return createReadStream(this.path(key)); }
  async exists(key: string): Promise<boolean> { return stat(this.path(key)).then(() => true, () => false); }
  async remove(key: string): Promise<void> { await rm(this.path(key), { force: true }); }
}

let store: FileStore | undefined;
export const fileStore = (): FileStore => (store ??= new LocalFileStore(env.docs.storageDir));
/** Tests swap the store. */
export const setFileStore = (s: FileStore | undefined): void => { store = s; };
