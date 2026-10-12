import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-coming-soon',
  imports: [TranslatePipe],
  template: `<div class="alert alert-info" role="status">{{ 'common.comingSoon' | translate }}</div>`,
})
export class ComingSoon {}
