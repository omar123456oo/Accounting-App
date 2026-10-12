import { abs, isZero } from '../../../core/money/money';

/** A signed balance (debit positive) as an amount and the side it sits on, so no report ever prints a minus sign. */
export function sideOf(balance: string): { amount: string; side: 'debit' | 'credit' | null } {
  if (isZero(balance)) return { amount: '0', side: null };
  return { amount: abs(balance), side: balance.startsWith('-') ? 'credit' : 'debit' };
}
