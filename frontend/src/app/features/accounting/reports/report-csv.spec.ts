import { GeneralLedgerReport, JournalRegisterReport, TrialBalanceReport } from '../accounting.models';
import { generalLedgerCsv, registerCsv, trialBalanceCsv } from './report-csv';

const t = (key: string) => key;
const name = (a: { nameEn: string }) => a.nameEn;

describe('report CSV', () => {
  it('neutralises spreadsheet formulas in text and exports exact plain decimals with the basis first', () => {
    const report: JournalRegisterReport = {
      includesUnposted: true,
      total: '10.0001',
      rows: [{ id: 'je-1', reference: 'DRAFT-1', postingDate: '2026-10-01', description: '=HYPERLINK("http://x")', status: 'draft', entryType: 'standard', totalDebit: '10.0001', createdByName: '+cmd' }],
    };
    const lines = registerCsv(report, 'Firm', t).split('\r\n');
    expect(lines[2]).toBe(',accounting.reports.basisDraftIncluded');
    expect(lines.join('\n')).toContain('\'=HYPERLINK(""http://x"")');
    expect(lines.join('\n')).toContain("'+cmd");
    expect(lines.join('\n')).toContain('10.0001');
  });

  it('never writes a negative amount: balances carry a debit/credit side instead', () => {
    const gl: GeneralLedgerReport = {
      includesUnposted: false,
      account: { id: 'a', code: '1110', nameAr: 'x', nameEn: 'Cash', normalBalance: 'debit' },
      openingBalance: '-5',
      rows: [{ date: '2026-01-01', journalId: 'j', reference: 'JE-2026-000001', description: 'd', status: 'posted', debit: '0', credit: '5', balance: '-10' }],
      totalDebit: '0',
      totalCredit: '5',
      closingBalance: '-10',
    };
    const csv = generalLedgerCsv(gl, 'Firm', t, name);
    expect(csv).not.toMatch(/,-\d/);
    expect(csv).toContain('accounting.reports.creditShort');
    const tb: TrialBalanceReport = { includesUnposted: false, rows: [{ accountId: 'a', code: '1110', nameAr: 'x', nameEn: 'Cash', opening: '-2.5', debit: '1', credit: '0', closingDebit: '0', closingCredit: '1.5' }], totals: { debit: '1', credit: '0', closingDebit: '0', closingCredit: '1.5' }, balanced: false, difference: '1.5' };
    expect(trialBalanceCsv(tb, 'Firm', t, name)).not.toMatch(/,-\d/);
  });
});
