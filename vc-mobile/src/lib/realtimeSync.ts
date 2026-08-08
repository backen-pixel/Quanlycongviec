export type CrmTaskChangedPayload = {
  lead_id?: string;
  task_id?: string | null;
  project_id?: string | null;
  action?: string;
  user_id?: string | null;
  at?: string;
};

export type ProjectStageChangedPayload = {
  id?: string;
  project_id?: string;
  sx_kanban_column_id?: string | null;
  [key: string]: unknown;
};

export type ProjectBoardChangedPayload = {
  project_id?: string | null;
  reason?: string;
  [key: string]: unknown;
};

export type ProjectCommentChangedPayload = {
  project_id?: string;
  lead_id?: string;
  action?: 'created' | 'updated' | 'deleted' | string;
  [key: string]: unknown;
};

export type LeadCommentChangedPayload = {
  lead_id?: string;
  action?: 'created' | 'updated' | 'deleted' | string;
  [key: string]: unknown;
};

/** Sự kiện đồng bộ dữ liệu app (Kanban, Công việc, Planner, chi tiết dự án…). */
export type SyncEvent =
  | { type: 'project:stage_changed'; payload: ProjectStageChangedPayload }
  | { type: 'crm:task_changed'; payload: CrmTaskChangedPayload }
  | { type: 'project:board_changed'; payload: ProjectBoardChangedPayload }
  | { type: 'project:comment_changed'; payload: ProjectCommentChangedPayload }
  | { type: 'lead:comment_changed'; payload: LeadCommentChangedPayload };

export function projectIdFromSyncEvent(evt: SyncEvent): string | null {
  const p = evt.payload as Record<string, unknown>;
  const pid = p.project_id ?? p.id ?? p.projectId;
  return pid != null && String(pid).trim() ? String(pid) : null;
}

export function dealIdFromSyncEvent(evt: SyncEvent): string | null {
  if (evt.type === 'crm:task_changed' || evt.type === 'lead:comment_changed') {
    const lid = evt.payload.lead_id;
    return lid != null && String(lid).trim() ? String(lid) : null;
  }
  if (evt.type === 'project:comment_changed') {
    const lid = evt.payload.lead_id;
    return lid != null && String(lid).trim() ? String(lid) : null;
  }
  return null;
}
