import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { abs, isZero } from '../../core/money/money';
import { AccountingFormat } from '../accounting/accounting-format';

/** Display helpers for statements. A negative amount is shown in parentheses, never by colour alone. */
@Injectable({ providedIn: 'root' })
export class FsFormat {
  private readonly language = inject(LanguageService);
  readonly money = inject(AccountingFormat);

  signed(value: string): string {
    return value.startsWith('-') && !isZero(value) ? `(${this.money.amount(abs(value))})` : this.money.amount(value);
  }

  percent(value: string | null): string {
    if (value === null) return '-';
    const text = this.signed(value);
    return `${text}%`;
  }

  label(x: { labelAr: string; labelEn: string }): string {
    return this.language.current() === 'ar' ? x.labelAr : x.labelEn;
  }
}
