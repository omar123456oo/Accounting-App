import { FormControl, FormGroup } from '@angular/forms';
import { isValidAmount, isValidPercent, isValidQuantity, toPlain } from '../../core/money/money';
import { DocLineInput, TaxRate } from './commercial.models';
import { LineAmounts, computeLine, computeTotals } from './doc-calc';

export interface RawLine {
  description: string;
  itemId: string;
  qty: string;
  unitPrice: string;
  discount: string;
  taxRateId: string;
}

export function lineGroup(value: Partial<RawLine> = {}): FormGroup {
  const text = (v: string | undefined, fallback = '') => new FormControl(v ?? fallback, { nonNullable: true });
  return new FormGroup({
    description: text(value.description),
    itemId: text(value.itemId),
    qty: text(value.qty, '1'),
    unitPrice: text(value.unitPrice),
    discount: text(value.discount, '0'),
    taxRateId: text(value.taxRateId),
  });
}

/** The amounts of each line as the server will compute them (same rounding rule), or null while the line is incomplete. */
export function previewLines(raw: readonly RawLine[], rates: readonly TaxRate[]): { lines: Array<LineAmounts | null>; totals: { net: string; taxTotal: string; total: string } } {
  const lines = raw.map((l) => {
    const qty = l.qty.trim();
    const price = l.unitPrice.trim();
    const discount = l.discount.trim() || '0';
    if (!isValidQuantity(qty) || !isValidAmount(price) || !isValidPercent(discount)) return null;
    const rate = l.taxRateId ? rates.find((r) => r.id === l.taxRateId) : undefined;
    return computeLine({ qty, unitPrice: price, discount }, rate?.rate ?? null);
  });
  return { lines, totals: computeTotals(lines.filter((l): l is LineAmounts => !!l)) };
}

/** Body lines for the API from the form values. `side` decides whether the item is a service type or an expense category. */
export function toLineInputs(raw: readonly RawLine[], side: 'ar' | 'ap'): DocLineInput[] {
  return raw.map((l) => ({
    description: l.description.trim(),
    ...(side === 'ar' ? { serviceTypeId: l.itemId } : { categoryId: l.itemId }),
    qty: l.qty.trim(),
    unitPrice: l.unitPrice.trim(),
    discount: l.discount.trim() || '0',
    ...(l.taxRateId ? { taxRateId: l.taxRateId } : {}),
  }));
}

export function toRawLines(lines: ReadonlyArray<DocLineInput>): RawLine[] {
  return lines.map((l) => ({ description: l.description, itemId: l.serviceTypeId ?? l.categoryId ?? '', qty: l.qty, unitPrice: toPlain(l.unitPrice), discount: l.discount, taxRateId: l.taxRateId ?? '' }));
}
