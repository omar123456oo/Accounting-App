import { Component, input } from '@angular/core';

/** Page title (the single h1) with a slot for the page's primary actions. */
@Component({
  selector: 'app-page-header',
  template: `
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4 pb-3 border-bottom">
      <h1 class="h3 mb-0">{{ title() }}</h1>
      <div class="d-flex flex-wrap gap-2"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
}
