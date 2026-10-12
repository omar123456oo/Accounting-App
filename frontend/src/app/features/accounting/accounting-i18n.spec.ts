import ar from '../../../assets/i18n/ar.json';
import en from '../../../assets/i18n/en.json';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`)));
}

describe('accounting translations', () => {
  it('has every accounting and navigation key in both Arabic and English, with real text', () => {
    const english = leaves((en as unknown as Tree)['accounting'] as Tree, 'accounting.');
    const arabic = leaves((ar as unknown as Tree)['accounting'] as Tree, 'accounting.');
    expect(english.length).toBeGreaterThan(150);
    expect(arabic).toEqual(english);
    for (const key of ['accounting', 'accounts', 'periods']) {
      expect((en.nav as Record<string, string>)[key]).toBeTruthy();
      expect((ar.nav as Record<string, string>)[key]).toBeTruthy();
    }
    const arText = JSON.stringify((ar as unknown as Tree)['accounting']);
    expect(arText).toMatch(/[؀-ۿ]/);
  });
});
