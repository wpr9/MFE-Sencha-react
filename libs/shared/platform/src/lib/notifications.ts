import type {
  InboxNotification,
  NotificationsApi,
  Severity,
  ToastOptions,
  Unsubscribe,
} from '@meridian/contracts';
import { randomId } from './ids';

export interface Toast extends ToastOptions {
  readonly id: string;
  readonly severity: Severity;
  readonly source: string;
}

export interface InboxItem extends InboxNotification {
  readonly id: string;
  readonly source: string;
  readonly createdAt: number;
  readonly read: boolean;
}

export interface NotificationsSnapshot {
  readonly toasts: readonly Toast[];
  readonly inbox: readonly InboxItem[];
  readonly unread: number;
}

export interface NotificationCenter {
  forSource(source: string): NotificationsApi;
  getSnapshot(): NotificationsSnapshot;
  subscribe(listener: () => void): Unsubscribe;
  dismissToast(id: string): void;
  markAllRead(): void;
  clearInbox(): void;
}

/** Toast queue + notification inbox, observable for the shell UI. */
export function createNotificationCenter(
  options: { readonly maxInbox?: number; readonly maxToasts?: number } = {},
): NotificationCenter {
  const { maxInbox = 50, maxToasts = 3 } = options;
  let snapshot: NotificationsSnapshot = { toasts: [], inbox: [], unread: 0 };
  const listeners = new Set<() => void>();

  const update = (next: Omit<NotificationsSnapshot, 'unread'>) => {
    snapshot = { ...next, unread: next.inbox.filter((item) => !item.read).length };
    for (const listener of [...listeners]) listener();
  };

  return {
    forSource(source) {
      return Object.freeze({
        toast(toast) {
          const entry: Toast = { severity: 'info', ...toast, id: randomId(), source };
          // Never evict the toast on screen (`toasts[0]`); a burst trims the queue behind it.
          const [current, ...queue] = snapshot.toasts;
          const toasts = current
            ? [current, ...[...queue, entry].slice(-(maxToasts - 1))]
            : [entry];
          update({ ...snapshot, toasts });
        },
        publish(notification) {
          const item: InboxItem = {
            ...notification,
            id: randomId(),
            source,
            createdAt: Date.now(),
            read: false,
          };
          update({ ...snapshot, inbox: [item, ...snapshot.inbox].slice(0, maxInbox) });
        },
      } satisfies NotificationsApi);
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dismissToast(id) {
      update({ ...snapshot, toasts: snapshot.toasts.filter((toast) => toast.id !== id) });
    },
    markAllRead() {
      update({
        ...snapshot,
        inbox: snapshot.inbox.map((item) => (item.read ? item : { ...item, read: true })),
      });
    },
    clearInbox() {
      update({ ...snapshot, inbox: [] });
    },
  };
}
