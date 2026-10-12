/** Escapes one CSV cell; cells that a spreadsheet could run as a formula get a leading apostrophe. */
function cell(value: string | number | boolean | undefined): string {
  let text = value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean | undefined>>): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

/** Client-side download through a Blob. The BOM keeps Arabic text intact when opened in Excel. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
