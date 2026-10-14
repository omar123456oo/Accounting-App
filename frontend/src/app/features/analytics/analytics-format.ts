import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { LOCALE_BY_LANG } from '../../core/i18n/locale';
import { format } from '../../core/money/money';
import { ClientFormat } from '../clients/client-format';

/** Number, percentage, money and month labels in the active language. */
@Injectable({ providedIn: 'root' })
export class AnalyticsFormat {
  private readonly language = inject(LanguageService);
  private readonly dates = inject(ClientFormat);

  private get locale(): string {
    return LOCALE_BY_LANG[this.language.current()];
  }

  int(n: number): string {
    return new Intl.NumberFormat(this.locale).format(n);
  }

  /** "12.5%" or an em dash when there is nothing to compare. */
  pct(value: number | null): string {
    return value === null ? '—' : `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 1 }).format(value)}%`;
  }

  money(amount: string): string {
    return format(amount, this.locale);
  }

  /** Whole-pound label for chart columns, where two decimals would not fit. */
  compactMoney(amount: string): string {
    return new Intl.NumberFormat(this.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(Number(amount));
  }

  month(value: string): string {
    return this.dates.monthName(Number(value.slice(5, 7))).slice(0, 3) + ' ' + value.slice(2, 4);
  }
}
