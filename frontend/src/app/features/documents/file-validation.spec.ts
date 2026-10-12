import { MAX_FILE_BYTES, checkFile, extensionOf, matchesSignature, sha256Hex } from './file-validation';

const bytes = (...b: number[]) => new Uint8Array(b);
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14];
const EXE = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
const file = (name: string, type: string, content: number[] | Uint8Array) => new File([new Uint8Array(content)], name, { type });

describe('file validation', () => {
  it.each([
    ['report.pdf', 'application/pdf', PDF],
    ['book.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ZIP],
    ['rows.csv', 'text/csv', Array.from(new TextEncoder().encode('a,b\n1,2\n'))],
    ['scan.png', 'image/png', PNG],
    ['photo.jpg', 'image/jpeg', JPG],
    ['photo.JPEG', 'image/jpeg', JPG],
  ])('accepts a genuine %s', async (name, type, content) => {
    expect(await checkFile(file(name, type, content))).toBeNull();
  });

  it('rejects an executable renamed to .pdf even when the browser declares application/pdf', async () => {
    expect(await checkFile(file('invoice.pdf', 'application/pdf', EXE))).toBe('signature');
  });

  it('rejects a PNG disguised as a PDF and a binary disguised as CSV', async () => {
    expect(await checkFile(file('a.pdf', 'application/pdf', PNG))).toBe('signature');
    expect(await checkFile(file('a.csv', 'text/csv', EXE))).toBe('signature');
  });

  it('rejects a disallowed extension', async () => {
    expect(await checkFile(file('setup.exe', 'application/x-msdownload', EXE))).toBe('extension');
    expect(await checkFile(file('noextension', 'application/pdf', PDF))).toBe('extension');
    expect(await checkFile(file('macro.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12', ZIP))).toBe('extension');
  });

  it('rejects a declared MIME type that does not match the extension', async () => {
    expect(await checkFile(file('a.pdf', 'image/png', PDF))).toBe('mime');
    expect(await checkFile(file('a.pdf', '', PDF))).toBe('mime');
  });

  it('enforces the 10 MB limit and rejects empty files', async () => {
    const over = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.pdf', { type: 'application/pdf' });
    expect(await checkFile(over)).toBe('tooLarge');
    expect(await checkFile(file('empty.pdf', 'application/pdf', []))).toBe('empty');
  });

  it('reads the extension case-insensitively from the last dot', () => {
    expect(extensionOf('a.tar.PDF')).toBe('pdf');
    expect(extensionOf('none')).toBe('');
  });

  it('matches signatures by the first bytes only', () => {
    expect(matchesSignature('pdf', bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(true);
    expect(matchesSignature('pdf', bytes(0x25, 0x50, 0x44))).toBe(false);
    expect(matchesSignature('csv', bytes(0x61, 0x00))).toBe(false);
  });

  it('hashes content with SHA-256', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
