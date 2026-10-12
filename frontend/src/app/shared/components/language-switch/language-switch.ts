import { Component, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';

@Component({
  selector: 'app-language-switch',
  imports: [TranslatePipe],
  template: `
    <button type="button" class="btn btn-outline-secondary btn-sm" (click)="toggle()">
      {{ 'nav.language' | translate }}
    </button>
  `,
})
export class LanguageSwitch {
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  toggle(): void {
    const next = this.language.current() === 'ar' ? 'en' : 'ar';
    this.language.use(next);
    this.translate.use(next);
  }
}
