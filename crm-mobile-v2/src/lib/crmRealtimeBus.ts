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
