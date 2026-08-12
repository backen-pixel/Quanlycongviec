/** Số thông báo chưa đọc — dùng chung chuông header / Menu / màn Thông báo. */

export type NotificationCounts = {
  activity: number;
  assignments: number;
  events: number;
  deadlines: number;
  total: number;
};

export const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  activity: 0,
  assignments: 0,
  events: 0,
  deadlines: 0,
  total: 0,
};

type Listener = (next: NotificationCounts) => void;

let current: NotificationCounts = EMPTY_NOTIFICATION_COUNTS;
const listeners = new Set<Listener>();

/** Chuông header: không gồm nhắc hạn (trùng badge tab Deadline). */
export function bellUnreadCount(c: NotificationCounts = current): number {
  return Math.max(0, c.activity) + Math.max(0, c.assignments) + Math.max(0, c.events);
}

export function getNotificationCounts(): NotificationCounts {
  return current;
}

export function setNotificationCounts(next: NotificationCounts): void {
  const total = next.activity + next.assignments + next.events + next.deadlines;
  current = { ...next, total };
  for (const fn of listeners) {
    try {
      fn(current);
    } catch {
      /* bỏ qua */
    }
  }
}

export function subscribeNotificationCounts(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
