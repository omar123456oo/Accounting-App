import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'app.lang';
const CSS_ID = 'bootstrap-css';
const CSS_BASE = 'assets/bootstrap/';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly doc = inject(DOCUMENT);
  private readonly lang = signal<Lang>(this.readStored());

  /** Signal-backed accessor: call as `current()`. */
  readonly current = this.lang.asReadonly();

  constructor() {
    this.apply(this.lang());
  }

  dir(): 'rtl' | 'ltr' {
    return this.lang() === 'ar' ? 'rtl' : 'ltr';
  }

  use(lang: Lang): void {
    this.lang.set(lang);
    this.apply(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage unavailable: the choice simply won't persist.
    }
  }

  private readStored(): Lang {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  }

  private apply(lang: Lang): void {
    const root = this.doc.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    let link = this.doc.getElementById(CSS_ID) as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.id = CSS_ID;
      link.rel = 'stylesheet';
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', CSS_BASE + (lang === 'ar' ? 'bootstrap.rtl.min.css' : 'bootstrap.min.css'));
  }
}
