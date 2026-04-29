/** Một dòng bảng `notifications` (API dashboard + socket). */
export type AppNotification = {
  id: string;
  user_id?: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type NotificationPrefs = {
  user_id?: string;
  browser_push?: boolean;
  sound?: boolean;
  task_assigned?: boolean;
  task_completed?: boolean;
  deadline_warning?: boolean;
  comment_added?: boolean;
  stage_changed?: boolean;
  deal_won?: boolean;
  approval_request?: boolean;
  checklist_completed?: boolean;
  lead_assigned?: boolean;
  order_confirmed?: boolean;
  invoice_overdue?: boolean;
  lead_new?: boolean;
  deal_new?: boolean;
  production_deadlines?: boolean;
  crm_lead_deadlines?: boolean;
  logistics_deadlines?: boolean;
};
