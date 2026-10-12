import { add, cmp, format, isValidAmount, isValidPercent, isValidQuantity, isZero, max, min, mul, mulDiv, neg, percentOf, round2, roundTo, sub, sum, toPlain } from './money';

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

  describe('multiplication and rounding', () => {
    it('multiplies exactly where floats fail', () => {
      expect(mul('0.1', '0.2')).toBe('0.02');
      expect(mul('1.1', '1.1')).toBe('1.21');
      expect(mul('19.99', '3')).toBe('59.97');
    });

    it('rounds half up at the requested places, away from zero for negatives', () => {
      expect(roundTo('1.005', 2)).toBe('1.01');
      expect(roundTo('0.9999', 2)).toBe('1.00');
      expect(roundTo('2.5', 0)).toBe('3');
      expect(roundTo('-2.675', 2)).toBe('-2.68');
    });

    it('computes quantity times price times (1 - discount) with one rounding step', () => {
      // 0.3333 x 3.00 = 0.9999 -> 1.00 ; 15 percent of 1.00 = 0.15
      expect(roundTo(mul('0.3333', '3'), 2)).toBe('1.00');
      expect(percentOf('1.00', '15')).toBe('0.15');
      expect(percentOf('10.05', '14')).toBe('1.41');
      expect(percentOf('0.01', '50')).toBe('0.01');
      expect(percentOf('0.03', '50')).toBe('0.02');
    });

    it('divides with a single final rounding and refuses a zero divisor', () => {
      expect(mulDiv('100', '1', '3', 4)).toBe('33.3333');
      expect(mulDiv('200', '1', '3', 2)).toBe('66.67');
      expect(() => mulDiv('1', '1', '0', 2)).toThrow(RangeError);
    });

    it('takes minimum and maximum, and validates percentages and quantities', () => {
      expect(min('2', '10')).toBe('2');
      expect(max('2', '10')).toBe('10');
      expect(isValidPercent('14')).toBe(true);
      expect(isValidPercent('100.0001')).toBe(false);
      expect(isValidPercent('-1')).toBe(false);
      expect(isValidQuantity('0.0001')).toBe(true);
      expect(isValidQuantity('0')).toBe(false);
      expect(isValidQuantity('1.23456')).toBe(false);
    });
  });
});
