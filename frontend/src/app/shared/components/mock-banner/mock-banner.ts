import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';

/** Visible whenever the in-app mock API is serving data, so demo data is never mistaken for real data. */
@Component({
  selector: 'app-mock-banner',
  imports: [TranslatePipe],
  template: `
    @if (enabled) {
      <div class="bg-warning text-dark text-center small py-1 fw-bold" role="status">
        {{ 'mock.banner' | translate }}
      </div>
    }
  `,
})
export class MockBanner {
  protected readonly enabled = environment.useMockApi;
}
