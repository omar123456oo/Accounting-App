import { toPlain } from '../../core/money/money';
import { toCsv } from '../clients/csv';
import { Statement } from './commercial.models';

type T = (key: string) => string;

/** Plain decimals, no rounding, with the party and the period on the first rows. */
export function statementCsv(r: Statement, ledger: string, t: T): string {
  const header = ['accounting.reports.col.date', 'commercial.statement.type', 'accounting.reports.col.reference', 'accounting.reports.col.description', `commercial.statement.cols.${r.side}Debit`, `commercial.statement.cols.${r.side}Credit`, 'accounting.reports.col.balance'].map(t);
  const rows: Array<Array<string | undefined>> = [['', t('accounting.reports.opening'), '', '', '', '', toPlain(r.openingBalance)]];
  for (const l of r.lines) rows.push([l.date, t(`commercial.statement.kinds.${l.kind}`), l.reference, l.description, toPlain(l.debit), toPlain(l.credit), toPlain(l.balance)]);
  rows.push(['', t('accounting.reports.closing'), '', '', '', '', toPlain(r.closingBalance)]);
  return toCsv(['', `${t(`commercial.statement.${r.side}.title`)}: ${r.party.name}`], [['', ledger], ['', `${r.from || '-'} / ${r.to}`], [], header, ...rows]);
}
