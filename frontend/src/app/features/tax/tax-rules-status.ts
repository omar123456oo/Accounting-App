import { Component, Injectable, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TaxApiService } from './tax-api.service';

/** Whether any rule the tax screens rely on is demo or not professionally verified. Reloaded on demand. */
@Injectable({ providedIn: 'root' })
export class TaxRulesStatus {
  private readonly api = inject(TaxApiService);
  private readonly state = signal<boolean | null>(null);
  readonly unverified = this.state.asReadonly();

  load(): void {
    this.api.settings().subscribe({ next: (s) => this.state.set(s.unverified), error: () => this.state.set(null) });
  }
}

/** The visible warning that must stay on every tax screen until a specialist has verified the rules. */
@Component({
  selector: 'app-unverified-rules-banner',
  imports: [TranslatePipe],
  template: `
    @if (status.unverified()) {
      <div class="alert alert-warning d-flex align-items-start gap-2" role="alert" id="unverified-rules-banner">
        <i class="fa-solid fa-triangle-exclamation mt-1" aria-hidden="true"></i>
        <div>
          <strong>{{ 'tax.unverifiedTitle' | translate }}</strong>
          <div>{{ 'tax.unverifiedText' | translate }}</div>
        </div>
      </div>
    }
  `,
})
export class UnverifiedRulesBanner {
  protected readonly status = inject(TaxRulesStatus);

  constructor() {
    this.status.load();
  }
}
