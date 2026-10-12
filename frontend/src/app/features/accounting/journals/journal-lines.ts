import { abs, cmp, isPositive, isValidAmount, isZero, sub, sum } from '../../../core/money/money';

export interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

export interface LineAnalysis {
  totalDebit: string;
  totalCredit: string;
  /** Absolute difference between the totals. */
  difference: string;
  /** Which side is larger when the entry is out of balance. */
  side: 'debit' | 'credit' | null;
  balanced: boolean;
  completeCount: number;
  /** 1-based numbers of non-blank lines that lack an account or have not exactly one positive side. */
  incomplete: number[];
  /** 1-based numbers of lines with an amount that is not a valid decimal (at most four places). */
  invalid: number[];
  /** True when the entry may leave draft: two or more complete lines, none incomplete, and balanced. */
  ready: boolean;
}

const blank = (l: LineDraft): boolean => l.accountId === '' && l.debit.trim() === '' && l.credit.trim() === '';
const amountOk = (v: string): boolean => v === '' || isValidAmount(v);

/** The live totals of the entry form. Every number goes through the money module, never JS arithmetic. */
export function analyzeLines(lines: readonly LineDraft[]): LineAnalysis {
  const incomplete: number[] = [];
  const invalid: number[] = [];
  const debits: string[] = [];
  const credits: string[] = [];
  let completeCount = 0;
  lines.forEach((l, i) => {
    if (blank(l)) return;
    const debit = l.debit.trim();
    const credit = l.credit.trim();
    if (!amountOk(debit) || !amountOk(credit)) {
      invalid.push(i + 1);
      incomplete.push(i + 1);
      return;
    }
    if (debit) debits.push(debit);
    if (credit) credits.push(credit);
    const oneSide = (debit !== '' && isPositive(debit)) !== (credit !== '' && isPositive(credit));
    if (l.accountId && oneSide) completeCount++;
    else incomplete.push(i + 1);
  });
  const totalDebit = sum(debits);
  const totalCredit = sum(credits);
  const balanced = cmp(totalDebit, totalCredit) === 0 && !isZero(totalDebit);
  const difference = abs(sub(totalDebit, totalCredit));
  return {
    totalDebit,
    totalCredit,
    difference,
    side: isZero(difference) ? null : cmp(totalDebit, totalCredit) > 0 ? 'debit' : 'credit',
    balanced,
    completeCount,
    incomplete: incomplete.sort((a, b) => a - b),
    invalid,
    ready: incomplete.length === 0 && completeCount >= 2 && balanced,
  };
}
