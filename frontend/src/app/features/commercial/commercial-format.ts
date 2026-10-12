import { Injectable, inject } from '@angular/core';
import { BadgeTone } from '../../shared/components/status-badge/status-badge';
import { AccountingFormat } from '../accounting/accounting-format';
import { LanguageService } from '../../core/i18n/language.service';

/** The state is always shown as text; the tone only reinforces it. */
export const DOC_TONE: Record<string, BadgeTone> = {
  draft: 'secondary',
  pending_approval: 'warning',
  issued: 'info',
  approved: 'info',
  partially_paid: 'info',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'secondary',
  credited: 'secondary',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  converted: 'secondary',
  submitted: 'warning',
};

/** Display helpers for the commercial pages: the ledger amount and date formats plus names in the active language. */
@Injectable({ providedIn: 'root' })
export class CommercialFormat {
  readonly base = inject(AccountingFormat);
  private readonly language = inject(LanguageService);
  readonly tone = DOC_TONE;

  amount(value: string): string {
    return this.base.amount(value);
  }
  exact(value: string): string {
    return this.base.exact(value);
  }
  date(value: string): string {
    return this.base.date(value);
  }
  dateTime(value: string): string {
    return this.base.dateTime(value);
  }
  name(item: { nameAr: string; nameEn: string }): string {
    return this.language.current() === 'ar' ? item.nameAr : item.nameEn;
  }
}
