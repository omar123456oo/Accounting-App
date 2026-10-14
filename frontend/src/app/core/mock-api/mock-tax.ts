import { LedgerCtx } from './mock-ledger-store';
import { handleDeadlines, handleProfile } from './mock-tax-profile';
import { handleReturns } from './mock-tax-returns';
import { handleWithholding } from './mock-tax-withholding';
import { MockResult, fail } from './mock-types';

/** Routes `ledger/:ledgerId/tax/<section>/...` inside the already scoped ledger entity. */
export function handleTax(ctx: LedgerCtx, rest: string[]): MockResult | Promise<MockResult> {
  const [section, ...tail] = rest;
  switch (section) {
    case 'profile':
      return handleProfile(ctx);
    case 'deadlines':
      return handleDeadlines(ctx, tail);
    case 'returns':
      return handleReturns(ctx, tail);
    case 'withholding':
      return handleWithholding(ctx, tail);
    default:
      return fail(404, 'notFound');
  }
}
