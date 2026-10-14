import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { BadgeTone } from '../../shared/components/status-badge/status-badge';
import { ClientFormat } from '../clients/client-format';
import { LeaveStatus, LeaveType } from './hr.models';

export const LEAVE_TONE: Record<LeaveStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'secondary' };
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Display helpers for the HR pages. Names follow the active language; money and dates reuse the client formatters. */
@Injectable({ providedIn: 'root' })
export class HrFormat {
  private readonly language = inject(LanguageService);
  readonly base = inject(ClientFormat);

  typeName(types: readonly LeaveType[], id: string): string {
    const t = types.find((x) => x.id === id);
    return t ? (this.language.current() === 'ar' ? t.nameAr : t.nameEn) : id;
  }

  name(t: LeaveType): string {
    return this.language.current() === 'ar' ? t.nameAr : t.nameEn;
  }

  money(amount: string): string {
    return this.base.money(amount);
  }

  date(value: string): string {
    return this.base.date(value);
  }

  dateTime(value: string): string {
    return this.base.dateTime(value);
  }

  /** "2026-10" as a long month and year. */
  month(value: string): string {
    return this.base.monthName(Number(value.slice(5, 7))) + ' ' + value.slice(0, 4);
  }

  weekday(day: number): string {
    // 2023-01-01 was a Sunday.
    return new Intl.DateTimeFormat(this.language.current() === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));
  }
}
