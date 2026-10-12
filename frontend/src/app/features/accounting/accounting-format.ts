import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../core/i18n/language.service';
import { LOCALE_BY_LANG } from '../../core/i18n/locale';
import { format, formatExact } from '../../core/money/money';
import { BadgeTone } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { LedgerEntity } from './accounting.models';

export const JOURNAL_TONE: Record<string, BadgeTone> = { draft: 'secondary', pending_approval: 'warning', approved: 'info', posted: 'success', reversed: 'danger' };
export const PERIOD_TONE: Record<string, BadgeTone> = { open: 'success', closed: 'warning', locked: 'secondary' };

/**
 * Display helpers for ledger pages. They read the language signal so OnPush templates re-render on a switch.
 * Amounts come in as decimal strings and are formatted by the money module; nothing here does arithmetic.
 */
@Injectable({ providedIn: 'root' })
export class AccountingFormat {
  private readonly language = inject(LanguageService);
  private readonly dates = inject(ClientFormat);
  private readonly translate = inject(TranslateService);

  private get locale(): string {
    return LOCALE_BY_LANG[this.language.current()];
  }

  /** Two decimal places, rounded half up. For tables and reports. */
  amount(value: string): string {
    return format(value, this.locale);
  }

  /** Every stored digit (up to four decimals). For live totals and differences while entering a journal. */
  exact(value: string): string {
    return formatExact(value, this.locale);
  }

  date(value: string): string {
    return this.dates.date(value);
  }

  dateTime(value: string): string {
    return this.dates.dateTime(value);
  }

  /** Firm books carry a translated label; a client ledger is named after the client. */
  ledgerLabel(entity: LedgerEntity | null): string {
    if (!entity) return '';
    return entity.type === 'firm' ? this.translate.instant('accounting.ledger.firm') : this.translate.instant('accounting.ledger.client', { name: entity.name });
  }

  /** The account name in the active language. */
  name(account: { nameAr: string; nameEn: string }): string {
    return this.language.current() === 'ar' ? account.nameAr : account.nameEn;
  }
}
