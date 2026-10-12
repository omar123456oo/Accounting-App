import { Statement } from './commercial.models';
import { statementCsv } from './statement-csv';

const t = (k: string) => k;
const statement: Statement = {
  side: 'ar',
  party: { id: 'cu-1', name: 'DEMO Customer, "Ltd"' },
  from: '',
  to: '2026-10-12',
  openingBalance: '0.0000',
  lines: [
    { date: '2026-10-01', kind: 'invoice', reference: 'INV-2026-000001', description: '=1+1', debit: '1140.5000', credit: '0.0000', balance: '1140.5000' },
    { date: '2026-10-05', kind: 'payment', reference: 'RC-2026-000001', description: '', debit: '0.0000', credit: '140.5000', balance: '1000.0000' },
  ],
  closingBalance: '1000.0000',
  unapplied: '0.0000',
};

describe('statement CSV', () => {
  it('keeps plain decimals without rounding, escapes the party name and neutralises formulas', () => {
    const csv = statementCsv(statement, 'Firm books', t);
    expect(csv).toContain('"commercial.statement.ar.title: DEMO Customer, ""Ltd"""');
    expect(csv).toContain('2026-10-01,commercial.statement.kinds.invoice,INV-2026-000001,\'=1+1,1140.5,0,1140.5');
    expect(csv.trimEnd().split('\r\n').at(-1)).toBe(',accounting.reports.closing,,,,,1000');
  });
});
