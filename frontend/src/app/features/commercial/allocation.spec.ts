import { OpenDoc, autoAllocate, summarize } from './allocation';

const docs: OpenDoc[] = [
  { id: 'a', reference: 'INV-1', dueDate: '2026-09-01', balance: '600.0000' },
  { id: 'b', reference: 'INV-2', dueDate: '2026-08-01', balance: '400.5000' },
  { id: 'c', reference: 'INV-3', dueDate: '2026-10-01', balance: '0.1000' },
];

describe('allocation table maths', () => {
  it('adds the rows exactly and reports what is left unallocated', () => {
    const s = summarize(docs, { a: '0.1', b: '0.2' }, '1');
    expect(s.allocated).toBe('0.3000');
    expect(s.unallocated).toBe('0.7000');
    expect(s.overCapacity).toBe(false);
    expect(s.valid).toBe(true);
    expect(s.rows.map((r) => r.remaining)).toEqual(['599.9000', '400.3000', '0.1000']);
  });

  it('marks a row above the open balance and a table above the payment amount', () => {
    const over = summarize(docs, { a: '600.0001' }, '1000');
    expect(over.rows[0].problem).toBe('overDocument');
    expect(over.valid).toBe(false);
    const tooMuch = summarize(docs, { a: '600', b: '400.5' }, '1000');
    expect(tooMuch.unallocated).toBe('-0.5000');
    expect(tooMuch.overCapacity).toBe(true);
    expect(tooMuch.valid).toBe(false);
  });

  it('rejects zero, negative and malformed amounts but ignores blank rows', () => {
    for (const bad of ['0', '-5', 'abc', '1.23456', '1e3']) {
      expect(summarize(docs, { a: bad }, '100').rows[0].problem).toBe('invalid');
    }
    expect(summarize(docs, { a: '  ' }, '100').valid).toBe(true);
  });

  it('allocates the oldest due document first and never above a balance or the capacity', () => {
    expect(autoAllocate(docs, '500')).toEqual({ b: '400.5000', a: '99.5000' });
    expect(autoAllocate(docs, '2000')).toEqual({ b: '400.5000', a: '600.0000', c: '0.1000' });
    expect(autoAllocate(docs, '0')).toEqual({});
    const full = autoAllocate(docs, '750.3');
    expect(summarize(docs, full, '750.3').unallocated).toBe('0.0000');
  });
});
