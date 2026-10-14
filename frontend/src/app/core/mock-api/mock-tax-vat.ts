import { DocLine } from '../../features/commercial/commercial.models';
import { TaxClass, VatCalc, VatReconciliationRow, VatTransaction } from '../../features/tax/tax.models';
import { abs, add, cmp, isZero, sub, sum } from '../money/money';
import { LedgerCtx, isPosted } from './mock-ledger-store';

const inRange = (date: string, start: string, end: string): boolean => date >= start && date <= end;

function classOf(line: Pick<DocLine, 'tax'>): TaxClass {
  if (!line.tax) return 'exempt';
  return isZero(line.tax.percent) ? 'zero_rated' : 'taxed';
}

function rowOf(ctx: LedgerCtx, accountId: string | undefined, start: string, end: string, returnAmount: string, side: 'credit' | 'debit'): VatReconciliationRow {
  if (!accountId) return { returnAmount, ledgerAmount: '0', difference: '0', reconciled: false, unmapped: true };
  const lines = ctx.store.journals
    .filter((j) => j.ledgerEntityId === ctx.entity.id && isPosted(j) && inRange(j.postingDate, start, end))
    .flatMap((j) => j.lines.filter((l) => l.accountId === accountId));
  const ledgerAmount = side === 'credit' ? sum(lines.map((l) => sub(l.credit, l.debit))) : sum(lines.map((l) => sub(l.debit, l.credit)));
  const diff = sub(returnAmount, ledgerAmount);
  return { returnAmount, ledgerAmount, difference: abs(diff), reconciled: isZero(diff), unmapped: false, accountId };
}

/**
 * VAT for a period from the TAX SNAPSHOTS stored on issued invoices, credit notes, approved bills and supplier
 * credits (never from the current rates). Output tax and input tax are then compared with the movement of the
 * tax control accounts in the ledger, and the result is stated as reconciled or as a difference.
 */
export function vatCalc(ctx: LedgerCtx, start: string, end: string): VatCalc {
  const c = ctx.store.commercial;
  const tx: VatTransaction[] = [];
  const invoices = c.invoices.filter((i) => i.ledgerEntityId === ctx.entity.id && i.number && inRange(i.date, start, end));
  for (const inv of invoices) {
    for (const l of inv.lines) tx.push({ source: 'invoice', docId: inv.id, reference: inv.reference, date: inv.date, partyName: inv.partyName, taxClass: classOf(l), ...(l.tax ? { taxCode: l.tax.code, percent: l.tax.percent } : {}), net: l.net, tax: l.taxAmount, ...(inv.journals[0] ? { journalId: inv.journals[0].journalId } : {}) });
  }
  const bills = c.bills.filter((b) => b.ledgerEntityId === ctx.entity.id && b.number && b.status !== 'cancelled' && b.bearer !== 'client_reimbursable' && inRange(b.date, start, end));
  for (const b of bills) {
    for (const l of b.lines) tx.push({ source: 'bill', docId: b.id, reference: b.reference, date: b.date, partyName: b.partyName, taxClass: classOf(l), ...(l.tax ? { taxCode: l.tax.code, percent: l.tax.percent } : {}), net: l.net, tax: l.taxAmount, ...(b.journals[0] ? { journalId: b.journals[0].journalId } : {}) });
  }
  for (const n of c.creditNotes.filter((x) => x.ledgerEntityId === ctx.entity.id && inRange(x.date, start, end))) {
    const doc = n.side === 'ar' ? c.invoice(ctx.entity.id, n.docId) : c.bill(ctx.entity.id, n.docId);
    if (!doc || (n.side === 'ap' && (doc as { bearer?: string }).bearer === 'client_reimbursable')) continue;
    for (const b of n.lines) {
      const line = doc.lines.find((l) => l.description === b.description);
      tx.push({ source: n.side === 'ar' ? 'credit_note' : 'supplier_credit', docId: n.id, reference: n.number, date: n.date, partyName: n.partyName, taxClass: line ? classOf(line) : 'exempt', ...(line?.tax ? { taxCode: line.tax.code, percent: line.tax.percent } : {}), net: b.net, tax: b.tax, journalId: n.journalId });
    }
  }
  tx.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  const of = (source: VatTransaction['source'], pick?: (t: VatTransaction) => boolean) => tx.filter((t) => t.source === source && (!pick || pick(t)));
  const outputTax = sub(sum(of('invoice').map((t) => t.tax)), sum(of('credit_note').map((t) => t.tax)));
  const inputTax = sub(sum(of('bill').map((t) => t.tax)), sum(of('supplier_credit').map((t) => t.tax)));
  const m = c.mappingsOf(ctx.entity.id);
  const output = rowOf(ctx, m.vatOutput, start, end, outputTax, 'credit');
  const input = rowOf(ctx, m.vatInput, start, end, inputTax, 'debit');
  const rates = new Map<string, VatCalc['rates'][number]>();
  for (const doc of [...invoices, ...bills]) for (const l of doc.lines) if (l.tax) rates.set(`${l.tax.code}@${l.tax.version}`, { code: l.tax.code, percent: l.tax.percent, version: l.tax.version, approvalStatus: l.tax.approvalStatus });
  const rateList = [...rates.values()].sort((a, b) => a.code.localeCompare(b.code) || a.version - b.version);
  return {
    kind: 'vat',
    outputNet: sub(sum(of('invoice', (t) => t.taxClass === 'taxed').map((t) => t.net)), sum(of('credit_note', (t) => t.taxClass === 'taxed').map((t) => t.net))),
    outputTax,
    zeroRatedNet: sub(sum(of('invoice', (t) => t.taxClass === 'zero_rated').map((t) => t.net)), sum(of('credit_note', (t) => t.taxClass === 'zero_rated').map((t) => t.net))),
    exemptNet: sub(sum(of('invoice', (t) => t.taxClass === 'exempt').map((t) => t.net)), sum(of('credit_note', (t) => t.taxClass === 'exempt').map((t) => t.net))),
    creditNoteTax: sum(of('credit_note').map((t) => t.tax)),
    inputNet: sub(sum(of('bill').map((t) => t.net)), sum(of('supplier_credit').map((t) => t.net))),
    inputTax,
    supplierCreditTax: sum(of('supplier_credit').map((t) => t.tax)),
    netTax: sub(outputTax, inputTax),
    transactions: tx,
    reconciliation: { output, input, reconciled: output.reconciled && input.reconciled },
    unverifiedRates: rateList.some((r) => r.approvalStatus !== 'professionally_verified'),
    rates: rateList,
  };
}

export const hasAnyTax = (calc: VatCalc): boolean => cmp(add(calc.outputTax, calc.inputTax), '0') !== 0 || calc.transactions.length > 0;
