import { toPlain } from '../../../core/money/money';
import { toCsv } from '../../clients/csv';
import { GeneralLedgerReport, JournalRegisterReport, TrialBalanceReport } from '../accounting.models';
import { sideOf } from './balance';

type T = (key: string) => string;
type Name = (a: { nameAr: string; nameEn: string }) => string;

/** Exports keep every stored digit (plain decimals, no rounding) and put the basis of the numbers on the first rows. */
function withBasis(title: string, basis: string, ledger: string, header: string[], rows: Array<Array<string | undefined>>): string {
  return toCsv(['', title], [['', ledger], ['', basis], [], header, ...rows]);
}

const basisOf = (t: T, includesUnposted: boolean): string => t(includesUnposted ? 'accounting.reports.basisDraftIncluded' : 'accounting.reports.basisPosted');
const amount = (v: string): string => toPlain(v);

export function trialBalanceCsv(r: TrialBalanceReport, ledger: string, t: T, name: Name): string {
  const header = ['code', 'account', 'opening', 'openingSide', 'debit', 'credit', 'closingDebit', 'closingCredit'].map((k) => t(`accounting.reports.col.${k}`));
  const rows = r.rows.map((x) => {
    const opening = sideOf(x.opening);
    return [x.code, name(x), amount(opening.amount), opening.side ? t(`accounting.reports.${opening.side}Short`) : '', amount(x.debit), amount(x.credit), amount(x.closingDebit), amount(x.closingCredit)];
  });
  rows.push([t('accounting.reports.totals'), '', '', '', amount(r.totals.debit), amount(r.totals.credit), amount(r.totals.closingDebit), amount(r.totals.closingCredit)]);
  return withBasis(t('accounting.reports.trialBalance'), basisOf(t, r.includesUnposted), ledger, header, rows);
}

export function generalLedgerCsv(r: GeneralLedgerReport, ledger: string, t: T, name: Name): string {
  const header = ['date', 'reference', 'description', 'status', 'debit', 'credit', 'balance', 'balanceSide'].map((k) => t(`accounting.reports.col.${k}`));
  const open = sideOf(r.openingBalance);
  const rows: Array<Array<string | undefined>> = [['', t('accounting.reports.opening'), '', '', '', '', amount(open.amount), open.side ? t(`accounting.reports.${open.side}Short`) : '']];
  for (const x of r.rows) {
    const b = sideOf(x.balance);
    rows.push([x.date, x.reference, x.description, t(`accounting.status.${x.status}`), amount(x.debit), amount(x.credit), amount(b.amount), b.side ? t(`accounting.reports.${b.side}Short`) : '']);
  }
  const close = sideOf(r.closingBalance);
  rows.push(['', t('accounting.reports.closing'), '', '', amount(r.totalDebit), amount(r.totalCredit), amount(close.amount), close.side ? t(`accounting.reports.${close.side}Short`) : '']);
  return withBasis(`${t('accounting.reports.generalLedger')}: ${r.account.code} ${name(r.account)}`, basisOf(t, r.includesUnposted), ledger, header, rows);
}

export function registerCsv(r: JournalRegisterReport, ledger: string, t: T): string {
  const header = ['reference', 'date', 'description', 'type', 'status', 'total', 'createdBy'].map((k) => t(`accounting.reports.col.${k}`));
  const rows = r.rows.map((x) => [x.reference, x.postingDate, x.description, t(`accounting.journals.types.${x.entryType}`), t(`accounting.status.${x.status}`), amount(x.totalDebit), x.createdByName]);
  rows.push([t('accounting.reports.totals'), '', '', '', '', amount(r.total), '']);
  return withBasis(t('accounting.reports.journalRegister'), basisOf(t, r.includesUnposted), ledger, header, rows);
}
