export const SEARCH_KINDS = ['page', 'client', 'document', 'task', 'invoice', 'bill', 'journal', 'employee', 'ticket', 'record'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Lower case, with Arabic diacritics removed, so "مُحَمَّد" finds "محمد". */
export const norm = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[ً-ٰٟ]/g, '').trim();

/** "client: acme" searches clients only. An unknown prefix is part of the term. */
export function parseQuery(raw: string): { term: string; kind?: SearchKind } {
  const m = /^\s*([a-z]+?)s?\s*:\s*(.*)$/i.exec(raw);
  const kind = m && SEARCH_KINDS.find((k) => k === m[1].toLowerCase());
  return kind ? { term: m![2].trim(), kind } : { term: raw.trim() };
}

interface Rankable { title: string; subtitle?: string }

const score = (term: string, h: Rankable): number => {
  const title = norm(h.title);
  if (title === term) return 0;
  if (title.startsWith(term)) return 1;
  if (title.includes(term)) return 2;
  if (h.subtitle && norm(h.subtitle).includes(term)) return 3;
  return 4;
};

/** Best matches first; equal scores keep their original order. Nothing is dropped. */
export function rankHits<T extends Rankable>(term: string, hits: readonly T[]): T[] {
  const t = norm(term);
  return hits.map((h, i) => ({ h, i, s: score(t, h) })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.h);
}
