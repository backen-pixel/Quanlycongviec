/** Sự kiện đồng bộ CRM toàn app — Kanban, báo cáo, planner, thông báo. */
export type CrmRealtimeReason =
  | 'dashboard_changed'
  | 'badge_updated'
  | 'task_changed'
  | 'live_version'
  | 'notification'
  | 'lead_comment';

export type CrmRealtimePayload = {
  reason: CrmRealtimeReason;
  detail?: Record<string, unknown>;
};

type Listener = (payload: CrmRealtimePayload) => void;

const listeners = new Set<Listener>();

/** Cửa sổ coi socket đã xử lý CRM — FCM không emit lại trong khoảng này. */
export const CRM_SOCKET_RECENT_MS = 45_000;
let lastCrmSocketAt = 0;

/** Gọi khi nhận sự kiện CRM qua Socket.IO. */
export function markCrmSocketActivity(): void {
  lastCrmSocketAt = Date.now();
}

export function wasCrmSocketRecent(withinMs: number = CRM_SOCKET_RECENT_MS): boolean {
  return lastCrmSocketAt > 0 && Date.now() - lastCrmSocketAt < withinMs;
}

export function subscribeCrmRealtime(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitCrmRealtime(payload: CrmRealtimePayload): void {
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      /* ignore subscriber errors */
    }
  }
}
