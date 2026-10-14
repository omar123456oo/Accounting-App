import { Injectable } from '@angular/core';

const KEY = 'recent-searches';
const MAX = 8;
const MIN_CHARS = 2;

/** The last few things this person searched for. Kept in this browser only; works without storage. */
@Injectable({ providedIn: 'root' })
export class RecentSearches {
  private items: string[] = this.read();

  list(): string[] {
    return [...this.items];
  }

  add(term: string): void {
    const t = term.trim();
    if (t.length < MIN_CHARS) return;
    this.items = [t, ...this.items.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
    this.write();
  }

  clear(): void {
    this.items = [];
    this.write();
  }

  private read(): string[] {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* storage unavailable: the list lives for this session only */
    }
  }
}
