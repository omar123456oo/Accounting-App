import { add, cmp, format, isValidAmount, isZero, neg, round2, sub, sum, toPlain } from './money';

describe('money', () => {
  it('adds without float error', () => {
    expect(add('0.1', '0.2')).toBe('0.3');
    expect(sum(['0.1', '0.2', '0.3'])).toBe('0.6');
    expect(sum([])).toBe('0');
  });

  it('keeps large values exact', () => {
    expect(add('9007199254740993', '0.0001')).toBe('9007199254740993.0001');
    expect(sub('99999999999999999999.9999', '0.0001')).toBe('99999999999999999999.9998');
  });

  it('handles negative values', () => {
    expect(sub('1.00', '2.50')).toBe('-1.5');
    expect(neg('3.2')).toBe('-3.2');
    expect(cmp('-0.0001', '0')).toBe(-1);
  });

  it('compares and detects zero decimal-exactly', () => {
    expect(cmp('0.30', '0.3')).toBe(0);
    expect(cmp('10', '9.9999')).toBe(1);
    expect(isZero('0.0000')).toBe(true);
    expect(isZero(sub('0.3', add('0.1', '0.2')))).toBe(true);
  });

  it('rounds half up to two places, for display only', () => {
    expect(round2('1.005')).toBe('1.01');
    expect(round2('2.675')).toBe('2.68');
    expect(round2('-1.005')).toBe('-1.01');
    expect(round2('1234.5')).toBe('1234.50');
  });

  it('formats with Intl and keeps every digit', () => {
    expect(format('1234567890123456.789', 'en-GB')).toBe('1,234,567,890,123,456.79');
    expect(format('-5', 'en-GB')).toBe('-5.00');
    expect(format('1234.5', 'ar-EG-u-ca-gregory').replace(/[^\d٠-٩]/g, '')).toBe('١٢٣٤٥٠');
  });

  it('validates amount strings to four decimal places', () => {
    expect(isValidAmount('10')).toBe(true);
    expect(isValidAmount('10.1234')).toBe(true);
    expect(isValidAmount('10.12345')).toBe(false);
    expect(isValidAmount('-1')).toBe(false);
    expect(isValidAmount('1e3')).toBe(false);
    expect(isValidAmount('')).toBe(false);
  });

  it('writes a plain editable string without exponent or trailing zeros', () => {
    expect(toPlain('1000.5000')).toBe('1000.5');
    expect(toPlain('0.0000001')).toBe('0.0000001');
    expect(toPlain('1e21')).toBe('1000000000000000000000');
  });
});
