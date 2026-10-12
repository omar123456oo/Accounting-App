import { Injectable, signal } from '@angular/core';

export type NotificationKind = 'error' | 'warning' | 'info';

export interface Notification {
  id: number;
  kind: NotificationKind;
  /** ngx-translate key, resolved by the toast component so messages follow the active language. */
  messageKey: string;
}

const AUTO_DISMISS_MS = 6000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 1;
  private readonly list = signal<Notification[]>([]);

  readonly notifications = this.list.asReadonly();

  show(kind: NotificationKind, messageKey: string): void {
    const id = this.nextId++;
    this.list.update((items) => [...items.filter((n) => n.messageKey !== messageKey), { id, kind, messageKey }]);
    setTimeout(() => this.dismiss(id), AUTO_DISMISS_MS);
  }

  error(messageKey: string): void {
    this.show('error', messageKey);
  }

  dismiss(id: number): void {
    this.list.update((items) => items.filter((n) => n.id !== id));
  }
}
