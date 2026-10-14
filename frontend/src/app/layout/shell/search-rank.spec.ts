import { SearchHit } from './global-search.service';
import { norm, parseQuery, rankHits } from './search-rank';

const hit = (title: string, subtitle?: string): SearchHit => ({ kind: 'client', title, subtitle, route: '/x/' + title });

describe('search ranking', () => {
  it('puts exact matches before prefix matches before contains matches before subtitle matches', () => {
    const ranked = rankHits('acme', [hit('Big Acme Group'), hit('Zed', 'owned by Acme'), hit('Acme Trading'), hit('ACME')]);
    expect(ranked.map((h) => h.title)).toEqual(['ACME', 'Acme Trading', 'Big Acme Group', 'Zed']);
  });

  it('keeps the original order for equal ranks', () => {
    const ranked = rankHits('co', [hit('Co One'), hit('Co Two'), hit('Co Three')]);
    expect(ranked.map((h) => h.title)).toEqual(['Co One', 'Co Two', 'Co Three']);
  });

  it('ignores Arabic diacritics and letter case', () => {
    expect(norm('مُحَمَّد')).toBe(norm('محمد'));
    expect(rankHits('محمد', [hit('شركة محمد'), hit('مُحَمَّد علي')]).map((h) => h.title)).toEqual(['مُحَمَّد علي', 'شركة محمد']);
  });

  it('does not drop hits it cannot rank', () => {
    expect(rankHits('zzz', [hit('A'), hit('B')])).toHaveLength(2);
  });
});

describe('search query parsing', () => {
  it('reads a "kind: term" filter, singular or plural, any case', () => {
    expect(parseQuery('client: acme')).toEqual({ term: 'acme', kind: 'client' });
    expect(parseQuery('Clients:acme')).toEqual({ term: 'acme', kind: 'client' });
    expect(parseQuery('  invoice:  INV-1 ')).toEqual({ term: 'INV-1', kind: 'invoice' });
  });

  it('leaves an unknown prefix in the term', () => {
    expect(parseQuery('foo: bar')).toEqual({ term: 'foo: bar' });
    expect(parseQuery('plain')).toEqual({ term: 'plain' });
  });

  it('keeps a bare filter with no term as an empty term', () => {
    expect(parseQuery('task:')).toEqual({ term: '', kind: 'task' });
  });
});
