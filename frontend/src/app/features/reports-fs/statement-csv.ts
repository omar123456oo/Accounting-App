import { toPlain } from '../../core/money/money';
import { toCsv } from '../clients/csv';
import { StatementView } from './fs.models';

type T = (key: string, params?: Record<string, unknown>) => string;

/** CSV of a statement: every stored digit, a leading basis block, and cells that could run as formulas are neutralised by toCsv. */
export function statementCsv(view: StatementView, ledger: string, t: T, lang: 'ar' | 'en'): string {
  const label = (x: { labelAr: string; labelEn: string }): string => (lang === 'ar' ? x.labelAr : x.labelEn);
  const cols = view.columns.map(label);
  const header = ['', ...cols];
  if (view.compare) for (const c of cols) header.push(`${c} (${t('fs.compareColumn')})`, `${c} (${t('fs.variance')})`, `${c} (${t('fs.variancePct')})`);
  const rows: Array<Array<string | undefined>> = [];
  for (const s of view.sections) {
    rows.push([label(s)]);
    for (const r of s.rows) {
      const row: Array<string | undefined> = [label(r), ...r.values.map(toPlain)];
      if (view.compare) r.values.forEach((_, i) => row.push(toPlain(r.compare?.[i] ?? '0'), toPlain(r.variance?.[i] ?? '0'), r.variancePct?.[i] ?? ''));
      rows.push(row);
    }
  }
  const basis = t(view.includesUnposted ? 'accounting.reports.basisDraftIncluded' : 'accounting.reports.basisPosted');
  const status = t(view.finalized ? 'fs.finalized' : 'fs.notFinalized');
  const range = `${view.from} / ${view.to}`;
  return toCsv(['', t(`fs.tabs.${view.kind}`)], [['', ledger], ['', range], ['', basis], ['', status], ['', t('fs.notCertified')], [], header, ...rows]);
}
