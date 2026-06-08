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

export type SyncEvent =
  | { type: 'project:stage_changed'; payload: ProjectStageChangedPayload }
  | { type: 'crm:task_changed'; payload: CrmTaskChangedPayload };
