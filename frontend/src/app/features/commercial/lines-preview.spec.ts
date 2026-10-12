import { TaxRate } from './commercial.models';
import { RawLine, lineGroup, previewLines, toLineInputs, toRawLines } from './lines-preview';

const rate = (over: Partial<TaxRate> = {}): TaxRate => ({ id: 'r', code: 'R', name: 'R', rate: '14', effectiveFrom: '2020-01-01', jurisdiction: 'EG', legalSource: 'x', approvalStatus: 'draft', version: 1, history: [], isDemo: true, ...over });
const line = (over: Partial<RawLine> = {}): RawLine => ({ description: 'x', itemId: 's', qty: '1', unitPrice: '100', discount: '0', taxRateId: '', ...over });

describe('line preview (same maths as the server)', () => {
  it('rounds each line half up to two places and sums the rounded lines', () => {
    const p = previewLines([line({ qty: '0.3333', unitPrice: '3', taxRateId: 'r' }), line({ qty: '3', unitPrice: '19.99', discount: '15' }), line({ unitPrice: '10.05', taxRateId: 'r' })], [rate()]);
    expect(p.lines.map((l) => l?.total)).toEqual(['1.1400', '50.9700', '11.4600']);
    expect(p.totals).toEqual({ net: '62.0200', taxTotal: '1.5500', total: '63.5700' });
  });

  it('treats a tax-exempt line as zero tax and an incomplete line as not yet priced', () => {
    const p = previewLines([line({ unitPrice: '200' }), line({ qty: '' }), line({ unitPrice: 'abc' }), line({ discount: '120' })], [rate()]);
    expect(p.lines[0]).toMatchObject({ taxAmount: '0.0000', total: '200.0000' });
    expect(p.lines.slice(1)).toEqual([null, null, null]);
    expect(p.totals.total).toBe('200.0000');
  });

  it('does not lose a cent where floating point would (1.005 and 0.1 + 0.2)', () => {
    expect(previewLines([line({ unitPrice: '1.005' })], []).lines[0]?.net).toBe('1.0100');
    expect(previewLines([line({ unitPrice: '0.1' }), line({ unitPrice: '0.2' })], []).totals.total).toBe('0.3000');
  });

  it('builds API lines for either side and restores form lines', () => {
    const raw = [line({ description: ' Fee ', itemId: 'st-1', qty: '2', unitPrice: '10.5', taxRateId: 'r' })];
    expect(toLineInputs(raw, 'ar')[0]).toEqual({ description: 'Fee', serviceTypeId: 'st-1', qty: '2', unitPrice: '10.5', discount: '0', taxRateId: 'r' });
    expect(toLineInputs(raw, 'ap')[0]).toMatchObject({ categoryId: 'st-1' });
    expect(toRawLines([{ description: 'A', serviceTypeId: 's', qty: '1', unitPrice: '100.0000', discount: '0' }])).toEqual([{ description: 'A', itemId: 's', qty: '1', unitPrice: '100', discount: '0', taxRateId: '' }]);
    expect(lineGroup().getRawValue()).toMatchObject({ qty: '1', discount: '0' });
  });
});
