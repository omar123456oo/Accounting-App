import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../core/i18n/language.service';
import { ClientFormat, maskAccount } from './client-format';
import { toCsv } from './csv';

describe('client formatting', () => {
  it('masks all but the last four digits of an account number', () => {
    expect(maskAccount('0011223344')).toBe('••••••3344');
    expect(maskAccount('123')).toBe('123');
  });

  it('formats money from the decimal string without float rounding', () => {
    TestBed.inject(LanguageService).use('en');
    const text = TestBed.inject(ClientFormat).money('1234567890123.10');
    expect(text.replace(/\D/g, '')).toBe('123456789012310');
  });

  it('formats business dates without shifting the calendar day', () => {
    TestBed.inject(LanguageService).use('en');
    expect(TestBed.inject(ClientFormat).date('2026-01-01')).toContain('1');
    expect(TestBed.inject(ClientFormat).date('2026-12-31')).toContain('31');
  });
});

describe('toCsv', () => {
  it('quotes separators and neutralises spreadsheet formulas', () => {
    const csv = toCsv(['a', 'b'], [['x,y', '=1+1'], ['say "hi"', undefined]]);
    expect(csv).toBe('a,b\r\n"x,y",\'=1+1\r\n"say ""hi""",');
  });
});
