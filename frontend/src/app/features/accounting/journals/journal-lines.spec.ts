import { LineDraft, analyzeLines } from './journal-lines';

const line = (accountId: string, debit = '', credit = ''): LineDraft => ({ accountId, debit, credit, description: '' });

describe('analyzeLines', () => {
  it('is balanced only when debits equal credits to the last decimal', () => {
    expect(analyzeLines([line('a', '0.1'), line('b', '0.2'), line('c', '', '0.3')])).toMatchObject({ balanced: true, ready: true, difference: '0' });
    const off = analyzeLines([line('a', '100'), line('b', '', '99.9999')]);
    expect(off).toMatchObject({ balanced: false, ready: false, difference: '0.0001', side: 'debit' });
  });

  it('ignores blank lines and flags incomplete or invalid ones', () => {
    const result = analyzeLines([line('a', '5'), line('b', '', '5'), line('', '', ''), line('', '7'), line('c', '1', '1'), line('d', 'abc')]);
    expect(result.incomplete).toEqual([4, 5, 6]);
    expect(result.invalid).toEqual([6]);
    expect(result.ready).toBe(false);
  });

  it('needs at least two complete lines and a non-zero total', () => {
    expect(analyzeLines([line('a', '5')]).ready).toBe(false);
    expect(analyzeLines([line('a', '0'), line('b', '', '0')]).balanced).toBe(false);
    expect(analyzeLines([line('a', '12345678901234.5678'), line('b', '', '12345678901234.5678')]).ready).toBe(true);
  });
});
