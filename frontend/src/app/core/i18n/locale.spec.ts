import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';
import { provideAppLocale } from './locale';

describe('dynamic locale', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideAppLocale()] });
  });

  it('follows the language without a reload', () => {
    const lang = TestBed.inject(LanguageService);
    const locale = TestBed.inject(LOCALE_ID);
    expect(`${locale}`).toBe('ar-EG-u-ca-gregory');
    lang.use('en');
    expect(`${locale}`).toBe('en-GB');
  });

  it('formats dates with a Gregorian year and month name in Arabic', () => {
    const date = new Date(2026, 9, 12);
    const pipe = TestBed.runInInjectionContext(() => new DatePipe(TestBed.inject(LOCALE_ID) as string));
    const ar = pipe.transform(date, 'd MMMM y') as string;
    expect(ar).toContain('2026');
    expect(ar).toContain('أكتوبر');
    expect(ar).not.toContain('1448');
  });

  it('switches date, number and currency formatting live on the same pipe instances', () => {
    const lang = TestBed.inject(LanguageService);
    const id = TestBed.inject(LOCALE_ID) as string;
    const date = new DatePipe(id);
    const num = new DecimalPipe(id);
    const cur = new CurrencyPipe(id);
    const arDate = date.transform(new Date(2026, 9, 12), 'MMMM') as string;
    const arCur = cur.transform(5, 'EGP') as string;
    lang.use('en');
    expect(date.transform(new Date(2026, 9, 12), 'MMMM')).toBe('October');
    expect(date.transform(new Date(2026, 9, 12), 'MMMM')).not.toBe(arDate);
    expect(num.transform(1234.5, '1.2-2')).toBe('1,234.50');
    expect(cur.transform(5, 'EGP')).not.toBe(arCur);
    expect(cur.transform(5, 'EGP', 'code')).toContain('EGP');
  });
});
