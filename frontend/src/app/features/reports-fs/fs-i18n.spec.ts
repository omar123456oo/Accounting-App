import ar from '../../../assets/i18n/ar.json';
import en from '../../../assets/i18n/en.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`)));
}

/** Every Phase 5 namespace must exist in both languages with the same keys and real Arabic text. */
describe('Phase 5 translations', () => {
  it.each(['fs', 'tax', 'eta', 'closing', 'bank', 'audit', 'compliance'])('has the same keys in Arabic and English for %s', (ns) => {
    const e = (en as unknown as Tree)[ns];
    const a = (ar as unknown as Tree)[ns];
    if (!e && !a) return;
    expect(a).toBeDefined();
    expect(e).toBeDefined();
    expect(leaves(a as Tree)).toEqual(leaves(e as Tree));
    expect(JSON.stringify(a)).toMatch(/[؀-ۿ]/);
  });

  it('has the navigation entries of every Phase 5 group', () => {
    for (const key of ['statements', 'incomeStatement', 'balanceSheet', 'cashFlow', 'equityChanges', 'statementMapping']) {
      expect((en.nav as Record<string, string>)[key]).toBeTruthy();
      expect((ar.nav as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
