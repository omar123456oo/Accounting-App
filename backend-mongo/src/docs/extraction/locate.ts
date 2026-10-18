import { collapse, type PageText } from './pdf.js';

export interface Located { page: number; bbox?: { x: number; y: number; width: number; height: number } }

/** Fractions of the page (0..1), origin top-left, so the screen can draw it at any zoom. */
function box(p: PageText, hit: PageText['items']): Located['bbox'] {
  const x1 = Math.min(...hit.map((i) => i.x)); const x2 = Math.max(...hit.map((i) => i.x + i.width));
  const y1 = Math.min(...hit.map((i) => i.y)); const y2 = Math.max(...hit.map((i) => i.y + i.height));
  const r = (n: number) => Math.round(n * 10_000) / 10_000;
  return { x: r(Math.max(0, x1 / p.width)), y: r(Math.max(0, 1 - y2 / p.height)), width: r(Math.min(1, (x2 - x1) / p.width)), height: r(Math.min(1, (y2 - y1) / p.height)) };
}

/**
 * Finds the quote the AI gave as its evidence. The page it names is tried first, then the others.
 * Returns null when the text is not on any page: such a value is not grounded in the document and is not used.
 */
export function locate(pages: PageText[], quote: string, hintPage?: number): Located | null {
  const q = collapse(quote).toLowerCase();
  if (q.length < 2) return null;
  const order = [...pages].sort((a, b) => Number(b.page === hintPage) - Number(a.page === hintPage));
  for (const p of order) {
    const at = p.text.toLowerCase().indexOf(q);
    if (at < 0) continue;
    const hit = p.items.filter((i) => i.end > at && i.start < at + q.length);
    return { page: p.page, bbox: hit.length ? box(p, hit) : undefined };
  }
  return null;
}
