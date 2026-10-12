import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar-EG';
import localeEn from '@angular/common/locales/en-GB';
import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig, LOCALE_ID, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { LanguageService } from './core/i18n/language.service';
import { routes } from './app.routes';

registerLocaleData(localeAr, 'ar-EG');
registerLocaleData(localeEn, 'en-GB');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideTranslateService({
      fallbackLang: 'ar',
      loader: provideTranslateHttpLoader({ prefix: 'assets/i18n/', suffix: '.json' }),
    }),
    // Angular locale for date/number pipes is fixed at bootstrap from the stored choice.
    { provide: LOCALE_ID, useFactory: () => (inject(LanguageService).current() === 'ar' ? 'ar-EG' : 'en-GB') },
    provideAppInitializer(() => inject(TranslateService).use(inject(LanguageService).current())),
  ],
};
