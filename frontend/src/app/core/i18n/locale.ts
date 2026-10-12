import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar-EG';
import localeEn from '@angular/common/locales/en-GB';
import { EnvironmentProviders, LOCALE_ID, Provider, inject, makeEnvironmentProviders } from '@angular/core';
import { Lang, LanguageService } from './language.service';

/** Arabic uses the Gregorian calendar explicitly (the -u-ca-gregory extension), never Hijri. */
export const LOCALE_BY_LANG: Record<Lang, string> = {
  ar: 'ar-EG-u-ca-gregory',
  en: 'en-GB',
};

registerLocaleData(localeAr, LOCALE_BY_LANG.ar);
registerLocaleData(localeEn, LOCALE_BY_LANG.en);

/**
 * A String whose value is resolved on every read. Angular's DatePipe/DecimalPipe/CurrencyPipe keep the
 * injected LOCALE_ID and coerce it on each transform, so they follow language changes without a reload.
 */
export class DynamicLocaleId extends String {
  constructor(private readonly resolve: () => string) {
    super();
  }

  override toString(): string {
    return this.resolve();
  }

  override valueOf(): string {
    return this.resolve();
  }
}

export function provideAppLocale(): EnvironmentProviders {
  const provider: Provider = {
    provide: LOCALE_ID,
    useFactory: () => {
      const language = inject(LanguageService);
      return new DynamicLocaleId(() => LOCALE_BY_LANG[language.current()]);
    },
  };
  return makeEnvironmentProviders([provider]);
}
