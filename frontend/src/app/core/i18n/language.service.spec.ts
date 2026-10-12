import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.getElementById('bootstrap-css')?.remove();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it('defaults to Arabic RTL', () => {
    const svc = TestBed.inject(LanguageService);
    expect(svc.current()).toBe('ar');
    expect(svc.dir()).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('switches to English LTR and swaps the stylesheet', () => {
    const svc = TestBed.inject(LanguageService);
    svc.use('en');
    expect(svc.dir()).toBe('ltr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
    const link = document.getElementById('bootstrap-css') as HTMLLinkElement;
    expect(link.getAttribute('href')).toContain('bootstrap.min.css');
    svc.use('ar');
    expect(link.getAttribute('href')).toContain('bootstrap.rtl.min.css');
  });

  it('works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const svc = TestBed.inject(LanguageService);
    expect(svc.current()).toBe('ar');
    expect(() => svc.use('en')).not.toThrow();
    expect(svc.current()).toBe('en');
  });

  it('persists the choice', () => {
    TestBed.inject(LanguageService).use('en');
    expect(localStorage.getItem('app.lang')).toBe('en');
    TestBed.resetTestingModule();
    expect(TestBed.inject(LanguageService).current()).toBe('en');
  });
});
