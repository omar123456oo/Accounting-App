import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { Lang, LanguageService } from '../../core/i18n/language.service';
import { PageHeader } from '../../shared/components/page-header/page-header';

interface SettingsLink {
  labelKey: string;
  descKey: string;
  route: string;
  permission: string;
  icon: string;
}

const LINKS: readonly SettingsLink[] = [
  { labelKey: 'core.docTypes.title', descKey: 'settings.desc.docTypes', route: '/app/settings/doctypes', permission: 'admin.settings', icon: 'table-list' },
  { labelKey: 'roles.title', descKey: 'settings.desc.roles', route: '/app/settings/roles', permission: 'settings.manage', icon: 'user-shield' },
  { labelKey: 'roles.usersTitle', descKey: 'settings.desc.users', route: '/app/settings/users', permission: 'settings.manage', icon: 'users-gear' },
  { labelKey: 'nav.mappings', descKey: 'settings.desc.mappings', route: '/app/accounting/settings/mappings', permission: 'mappings.manage', icon: 'diagram-project' },
  { labelKey: 'commercial.settings.service-types', descKey: 'settings.desc.serviceTypes', route: '/app/accounting/settings/service-types', permission: 'mappings.manage', icon: 'briefcase' },
  { labelKey: 'commercial.settings.expense-categories', descKey: 'settings.desc.expenseCategories', route: '/app/accounting/settings/expense-categories', permission: 'mappings.manage', icon: 'tags' },
  { labelKey: 'nav.taxRates', descKey: 'settings.desc.taxRates', route: '/app/accounting/settings/tax-rates', permission: 'tax.rates.manage', icon: 'percent' },
  { labelKey: 'nav.periods', descKey: 'settings.desc.periods', route: '/app/accounting/periods', permission: 'ledger.view', icon: 'calendar-days' },
  { labelKey: 'nav.accounts', descKey: 'settings.desc.accounts', route: '/app/accounting/accounts', permission: 'ledger.view', icon: 'book' },
  { labelKey: 'nav.statementMapping', descKey: 'settings.desc.statementMapping', route: '/app/statements/mapping', permission: 'mappings.manage', icon: 'sitemap' },
];

/** Application settings: personal preferences plus a hub linking to the office configuration pages the user may open. */
@Component({
  selector: 'app-settings-page',
  imports: [RouterLink, TranslatePipe, PageHeader],
  template: `
    <app-page-header [title]="'nav.settings' | translate" />

    <div class="row g-4 mb-4">
      <section class="col-lg-6" aria-labelledby="pref-title">
        <div class="card h-100">
          <div class="card-body">
            <h2 class="h5 mb-3" id="pref-title"><i class="fa-solid fa-sliders me-2 text-primary" aria-hidden="true"></i>{{ 'settings.preferences' | translate }}</h2>
            <fieldset>
              <legend class="form-label">{{ 'settings.language' | translate }}</legend>
              <div class="btn-group" role="group">
                @for (l of languages; track l.code) {
                  <button type="button" class="btn" [class]="language.current() === l.code ? 'btn-primary' : 'btn-outline-secondary'" [attr.aria-pressed]="language.current() === l.code" (click)="use(l.code)">
                    {{ l.label }}
                  </button>
                }
              </div>
              <div class="form-text mt-2">{{ 'settings.languageHint' | translate }}</div>
            </fieldset>
          </div>
        </div>
      </section>

      <section class="col-lg-6" aria-labelledby="acct-title">
        <div class="card h-100">
          <div class="card-body">
            <h2 class="h5 mb-3" id="acct-title"><i class="fa-solid fa-circle-user me-2 text-primary" aria-hidden="true"></i>{{ 'settings.account' | translate }}</h2>
            <dl class="row mb-0">
              <dt class="col-sm-4 text-body-secondary fw-normal">{{ 'settings.name' | translate }}</dt>
              <dd class="col-sm-8">{{ auth.user()?.name }}</dd>
              <dt class="col-sm-4 text-body-secondary fw-normal">{{ 'settings.accountType' | translate }}</dt>
              <dd class="col-sm-8">{{ 'settings.type.' + auth.user()?.type | translate }}</dd>
              <dt class="col-sm-4 text-body-secondary fw-normal">{{ 'settings.permissions' | translate }}</dt>
              <dd class="col-sm-8 mb-0">{{ auth.user()?.permissions?.length ?? 0 }}</dd>
            </dl>
          </div>
        </div>
      </section>
    </div>

    <h2 class="h5 mb-3">{{ 'settings.configuration' | translate }}</h2>
    @if (links().length) {
      <div class="row g-3">
        @for (l of links(); track l.route) {
          <div class="col-md-6 col-xl-4">
            <a class="card h-100 text-decoration-none settings-link" [routerLink]="l.route">
              <div class="card-body d-flex gap-3 align-items-start">
                <span class="fs-4 text-primary" aria-hidden="true"><i class="fa-solid fa-{{ l.icon }} fa-fw"></i></span>
                <span>
                  <span class="d-block fw-semibold text-body">{{ l.labelKey | translate }}</span>
                  <span class="d-block small text-body-secondary">{{ l.descKey | translate }}</span>
                </span>
              </div>
            </a>
          </div>
        }
      </div>
    } @else {
      <div class="alert alert-info" role="status">{{ 'settings.noConfig' | translate }}</div>
    }
  `,
  styles: `
    .settings-link {
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .settings-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgb(15 23 42 / 10%);
    }
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  protected readonly languages: readonly { code: Lang; label: string }[] = [
    { code: 'ar', label: 'العربية' },
    { code: 'en', label: 'English' },
  ];
  protected readonly links = computed(() => LINKS.filter((l) => this.auth.can(l.permission)));

  protected use(code: Lang): void {
    this.language.use(code);
    this.translate.use(code);
  }
}
