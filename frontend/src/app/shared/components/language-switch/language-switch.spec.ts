import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { LanguageSwitch } from './language-switch';

describe('LanguageSwitch', () => {
  it('toggles the language on click', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [LanguageSwitch], providers: [provideTranslateService()] });
    const svc = TestBed.inject(LanguageService);
    const fixture = TestBed.createComponent(LanguageSwitch);
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(svc.current()).toBe('en');
    expect(svc.dir()).toBe('ltr');
  });
});
