import ar from '../../../assets/i18n/ar.json';
import en from '../../../assets/i18n/en.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`)));
}

describe('commercial translations', () => {
  it('has every commercial, navigation and dashboard key in both languages, with real Arabic text', () => {
    for (const root of ['commercial', 'dashboard']) {
      expect(leaves((ar as unknown as Tree)[root] as Tree)).toEqual(leaves((en as unknown as Tree)[root] as Tree));
    }
    expect(leaves((en as unknown as Tree)['commercial'] as Tree).length).toBeGreaterThan(400);
    for (const key of ['invoicing', 'payables', 'invoices', 'receipts', 'bills', 'suppliers', 'expenses', 'mappings', 'taxRates']) {
      expect((en.nav as Record<string, string>)[key]).toBeTruthy();
      expect((ar.nav as Record<string, string>)[key]).toBeTruthy();
    }
    expect(JSON.stringify((ar as unknown as Tree)['commercial'])).toMatch(/[؀-ۿ]/);
  });

  it('carries the required unverified-rates banner and keeps the placeholders of both languages equal', () => {
    expect((en as unknown as { commercial: { tax: { unverifiedBanner: string } } }).commercial.tax.unverifiedBanner).toBe('Rates are unverified demo values — Egyptian tax specialist must verify before use');
    const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).sort().join(',');
    const flat = (tree: Tree, prefix = ''): Record<string, string> => Object.fromEntries(Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v]] : Object.entries(flat(v, `${prefix}${k}.`)))));
    const english = flat((en as unknown as Tree)['commercial'] as Tree);
    const arabic = flat((ar as unknown as Tree)['commercial'] as Tree);
    for (const key of Object.keys(english)) expect(placeholders(arabic[key]), key).toBe(placeholders(english[key]));
  });
});
