import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { NotificationService } from '../../../core/notify/notification.service';

@Component({
  selector: 'app-toast-container',
  imports: [TranslatePipe],
  styleUrl: './toast-container.scss',
  template: `
    <div class="toasts" aria-live="polite">
      @for (n of notify.notifications(); track n.id) {
        <div class="toast show align-items-center border-0" role="alert" [class.text-bg-danger]="n.kind === 'error'" [class.text-bg-dark]="n.kind !== 'error'">
          <div class="d-flex">
            <div class="toast-body">{{ n.messageKey | translate }}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" [attr.aria-label]="'common.close' | translate" (click)="notify.dismiss(n.id)"></button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  protected readonly notify = inject(NotificationService);
}
