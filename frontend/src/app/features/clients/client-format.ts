import { Injectable, inject } from '@angular/core';
import { LOCALE_BY_LANG } from '../../core/i18n/locale';
import { LanguageService } from '../../core/i18n/language.service';
import { BadgeTone } from '../../shared/components/status-badge/status-badge';
import { ClientStatus } from './client.models';

export const STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  lead: 'info',
  onboarding: 'warning',
  active: 'success',
  suspended: 'secondary',
  closed: 'danger',
};

/** Shows only the last four characters of an account number. */
export function maskAccount(accountNo: string): string {
  return `${'•'.repeat(Math.max(0, accountNo.length - 4))}${accountNo.slice(-4)}`;
}

/**
 * Locale-aware display helpers. They read the language signal, so OnPush templates re-render on a language
 * switch. Money is handed to Intl as the decimal string, never converted to a JS number.
 */
@Injectable({ providedIn: 'root' })
export class ClientFormat {
  private readonly language = inject(LanguageService);

  private get locale(): string {
    return LOCALE_BY_LANG[this.language.current()];
  }

  money(amount: string, currency = 'EGP'): string {
    // Intl.NumberFormat v3 formats a decimal string exactly. The typings only list number | bigint.
    return new Intl.NumberFormat(this.locale, { style: 'currency', currency }).format(amount as unknown as number);
  }

  monthName(month: number): string {
    return new Intl.DateTimeFormat(this.locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month - 1, 1)));
  }

  /** Business date (YYYY-MM-DD): formatted in UTC so the calendar day never shifts. */
  date(value: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }

  /** Event time (UTC ISO): shown in the application time zone. */
  dateTime(value: string): string {
    return new Intl.DateTimeFormat(this.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(value));
  }
}
