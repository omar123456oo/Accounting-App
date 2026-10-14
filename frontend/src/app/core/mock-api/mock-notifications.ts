import { AppNotification, NotificationList } from '../../features/engage/engage.models';

/** In-memory notification feed. Modules call `notify`; the feed is per user and newest first. */
export class NotificationHub {
  private readonly items = new Map<string, AppNotification[]>();
  private seq = 1;

  notify(userId: string, kind: string, params: AppNotification['params'], link: string): void {
    const list = this.items.get(userId) ?? [];
    list.unshift({ id: `nt-${this.seq++}`, kind, params, link, read: false, at: new Date().toISOString() });
    this.items.set(userId, list.slice(0, 100));
  }

  list(userId: string): NotificationList {
    const data = structuredClone(this.items.get(userId) ?? []);
    return { data: data.slice(0, 50), meta: { unread: data.filter((n) => !n.read).length } };
  }

  /** False when the id is not one of this user's notifications. */
  markRead(userId: string, id: string): boolean {
    const n = this.items.get(userId)?.find((x) => x.id === id);
    if (n) n.read = true;
    return !!n;
  }

  markAllRead(userId: string): void {
    this.items.get(userId)?.forEach((n) => (n.read = true));
  }
}
