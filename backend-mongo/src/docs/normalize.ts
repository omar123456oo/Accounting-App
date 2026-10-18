/** Turns text found in a document into typed values. Every function returns null when the text is not a clear value: nothing is guessed. */

const ARABIC_DIGITS: Record<string, string> = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
export const latinDigits = (s: string): string => s.replace(/[٠-٩۰-۹]/g, (c) => ARABIC_DIGITS[c] ?? c);

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s ? s : null;
}

/**
 * ISO (2026-11-01), day-first with / . - (01/11/2026, the Egyptian convention), and "1 November 2026" / "November 1, 2026".
 * A numeric date such as 03/04/2026 is always read day-first. Callers that want to warn the reviewer use `isAmbiguousDate`.
 */
export function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = latinDigits(raw).trim().replace(/\s+/g, ' ');
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})(?:st|nd|rd|th)?[ -]([\p{L}.]+?)\.?,?[ -](\d{4})$/u.exec(s);
  if (m && MONTHS[m[2].toLowerCase().replace(/\.$/, '')]) return iso(+m[3], MONTHS[m[2].toLowerCase().replace(/\.$/, '')], +m[1]);
  m = /^([\p{L}.]+?)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/u.exec(s);
  if (m && MONTHS[m[1].toLowerCase().replace(/\.$/, '')]) return iso(+m[3], MONTHS[m[1].toLowerCase().replace(/\.$/, '')], +m[2]);
  return null;
}

/** True for 03/04/2026-style dates where day-first and month-first give two valid but different dates. */
export function isAmbiguousDate(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(latinDigits(raw).trim());
  return !!m && +m[1] <= 12 && +m[2] <= 12 && +m[1] !== +m[2];
}

/** Plain numbers: "1,234.50", "1.234,50", "١٢٣٤٫٥", "(120)" is not negative here (no accounting-sign guessing). */
export function normalizeNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = latinDigits(raw).replace(/[٫]/g, '.').replace(/[٬\s ]/g, '').trim();
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'); const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    // "1,234" is a thousands separator; "12,5" is a decimal comma.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_WORDS: Array<[RegExp, string]> = [
  [/\b(egp|le|l\.e\.?)\b|جنيه|ج\.م/i, 'EGP'], [/\b(usd|us\$)\b|\$|دولار/i, 'USD'], [/\b(eur)\b|€|يورو/i, 'EUR'],
  [/\b(sar)\b|ريال/i, 'SAR'], [/\b(aed)\b|درهم/i, 'AED'], [/\b(gbp)\b|£/i, 'GBP'],
];

export interface Money { amount: number; currency: string | null }
/** "EGP 12,500.00", "12,500 جنيه", "$ 99". The currency is null when the text names none. */
export function normalizeCurrency(raw: unknown): Money | null {
  if (raw && typeof raw === 'object' && 'amount' in raw) {
    const o = raw as { amount: unknown; currency?: unknown };
    const amount = normalizeNumber(o.amount);
    return amount === null ? null : { amount, currency: typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency) ? o.currency : null };
  }
  if (typeof raw === 'number') return Number.isFinite(raw) ? { amount: raw, currency: null } : null;
  if (typeof raw !== 'string') return null;
  const currency = CURRENCY_WORDS.find(([re]) => re.test(raw))?.[1] ?? null;
  const digits = /-?[\d٠-٩][\d٠-٩.,٫٬ ]*/.exec(raw);
  const amount = digits ? normalizeNumber(digits[0].trim().replace(/[.,]$/, '')) : null;
  return amount === null ? null : { amount, currency };
}

/** Egyptian national ID: 14 digits. Spaces and Arabic digits are accepted. */
export function normalizeNationalId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = latinDigits(raw).replace(/[\s-]/g, '');
  return /^\d{14}$/.test(s) ? s : null;
}

export function normalizeBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'نعم'].includes(s)) return true;
  if (['false', 'no', 'n', '0', 'لا'].includes(s)) return false;
  return null;
}
