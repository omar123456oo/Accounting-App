import { TestBed } from '@angular/core/testing';
import { RecentSearches } from './recent-searches';

describe('RecentSearches', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* storage unavailable */ } });

  it('lists newest first, without duplicates, ignoring short terms', () => {
    const r = TestBed.inject(RecentSearches);
    r.add('acme'); r.add('x'); r.add('  beta  '); r.add('ACME');
    expect(r.list()).toEqual(['ACME', 'beta']);
  });

  it('keeps at most eight', () => {
    const r = TestBed.inject(RecentSearches);
    for (let i = 0; i < 12; i++) r.add('term ' + i);
    expect(r.list()).toHaveLength(8);
    expect(r.list()[0]).toBe('term 11');
  });

  it('remembers across instances and can be cleared', () => {
    TestBed.inject(RecentSearches).add('persisted');
    TestBed.resetTestingModule();
    const again = TestBed.inject(RecentSearches);
    expect(again.list()).toEqual(['persisted']);
    again.clear();
    expect(again.list()).toEqual([]);
  });

  it('still works when storage throws', () => {
    const boom = () => { throw new Error('blocked'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom);
    const r = TestBed.inject(RecentSearches);
    expect(() => r.add('acme')).not.toThrow();
    expect(r.list()).toEqual(['acme']);
    vi.restoreAllMocks();
  });
});
