import { provideHttpClient, withInterceptors, withXsrfConfiguration, HttpInterceptorFn } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';
import { useMockApi } from '../environments/environment';
import { AuthService } from './core/auth/auth.service';
import { acceptLanguageInterceptor } from './core/http/accept-language.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { idempotencyInterceptor } from './core/http/idempotency.interceptor';
import { xsrfCredentialsInterceptor } from './core/http/xsrf-credentials.interceptor';
import { LanguageService } from './core/i18n/language.service';
import { provideAppLocale } from './core/i18n/locale';
import { mockApiInterceptor } from './core/mock-api/mock-api.interceptor';
import { routes } from './app.routes';

// The mock sits innermost so every other interceptor sees mock traffic exactly like real traffic.
const interceptors: HttpInterceptorFn[] = [xsrfCredentialsInterceptor, acceptLanguageInterceptor, idempotencyInterceptor, errorInterceptor];
if (useMockApi) {
  interceptors.push(mockApiInterceptor);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors(interceptors),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    provideTranslateService({
      fallbackLang: 'ar',
      loader: provideTranslateHttpLoader({ prefix: 'assets/i18n/', suffix: '.json' }),
    }),
    provideAppLocale(),
    provideAppInitializer(() => firstValueFrom(inject(TranslateService).use(inject(LanguageService).current()))),
    provideAppInitializer(() => firstValueFrom(inject(AuthService).loadMe())),
  ],
};
