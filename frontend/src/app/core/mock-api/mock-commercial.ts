import { handleBills, handleClaims } from './mock-commercial-bills';
import { handleCredits } from './mock-commercial-credits';
import { handleInvoices } from './mock-commercial-invoices';
import { handleParties } from './mock-commercial-parties';
import { handlePayments } from './mock-commercial-payments';
import { handleQuotations } from './mock-commercial-quotations';
import { handleRecurring } from './mock-commercial-recurring';
import { handleCommercialReports } from './mock-commercial-reports';
import { handleCatalogue, handleMappings, handleSettings } from './mock-commercial-settings';
import { LedgerCtx } from './mock-ledger-store';
import { MockResult, fail } from './mock-types';

/** Routes `ledger/:ledgerId/commercial/<section>/...`. Every handler works inside the already scoped ledger entity. */
export function handleCommercial(ctx: LedgerCtx, rest: string[]): MockResult {
  const [section, ...tail] = rest;
  switch (section) {
    case 'settings':
      return handleSettings(ctx);
    case 'mappings':
      return handleMappings(ctx);
    case 'service-types':
    case 'expense-categories':
      return handleCatalogue(ctx, section, tail);
    case 'customers':
      return handleParties(ctx, 'customer', tail);
    case 'suppliers':
      return handleParties(ctx, 'supplier', tail);
    case 'quotations':
      return handleQuotations(ctx, tail);
    case 'invoices':
      return handleInvoices(ctx, tail);
    case 'credit-notes':
      return handleCredits(ctx, 'ar', tail);
    case 'supplier-credits':
      return handleCredits(ctx, 'ap', tail);
    case 'payments':
      return handlePayments(ctx, 'ar', tail);
    case 'bill-payments':
      return handlePayments(ctx, 'ap', tail);
    case 'bills':
      return handleBills(ctx, tail);
    case 'expense-claims':
      return handleClaims(ctx, tail);
    case 'recurring-invoices':
      return handleRecurring(ctx, 'ar', tail);
    case 'recurring-bills':
      return handleRecurring(ctx, 'ap', tail);
    case 'reports':
      return handleCommercialReports(ctx, tail);
    default:
      return fail(404, 'notFound');
  }
}
