/** Cột Kanban sản xuất (production_pipeline_stages). */
export type KanbanStage = {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  order_index: number;
  slug?: string | null;
  bucket_slug?: string | null;
  workflow_stage_id?: string | null;
  workflow_stage?: {
    slug?: string | null;
  } | null;
  is_handover_to_logistics?: boolean;
  /** Cột VC gắn cờ «Chuyển LĐ» — kéo dự án vào cột này sẽ tự nhảy sang cột Lắp đặt. */
  is_handover_to_install?: boolean;
  crm_sync_type?: string | null;
  count?: number;
  total_value?: number;
};

/** Dự án sản xuất (projects) đã enrich sx_kanban_column_id. */
export type ProductionProject = {
  id: string;
  code: string;
  name: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  status?: string | null;
  priority?: string | null;
  deadline?: string | null;
  production_deadline?: string | null;
  created_at?: string | null;
  estimated_value?: number | null;
  progress?: number;
  task_total?: number;
  done_tasks?: number;
  /** Nhiệm vụ tách theo tab pipeline VC — dùng cho badge/tiến độ card theo tab đang mở. */
  task_total_vc?: number;
  done_tasks_vc?: number;
  task_total_install?: number;
  done_tasks_install?: number;
  is_overdue?: boolean;
  sx_intake?: boolean;
  sx_won_deal?: boolean;
  vc_intake?: boolean;
  vc_kanban_column_id?: string | null;
  current_stage_id?: string | null;
  workshop_type_id?: string | null;
  sx_kanban_column_id?: string | null;
  /** Cột Kanban resolve client-side (giống web). Dùng để nhóm/hiển thị. */
  resolved_column_id?: string | null;
  stage_name?: string | null;
  stage_slug?: string | null;
  production_person_id?: string | null;
  production_person_name?: string | null;
  sales_person_id?: string | null;
  sales_person_name?: string | null;
  logistics_person_id?: string | null;
  logistics_person_name?: string | null;
  installer_person_id?: string | null;
  installer_person_name?: string | null;
  company_name?: string | null;
  company_id?: string | null;
  workshop_type_name?: string | null;
  region_id?: string | null;
  region_name?: string | null;
  /** Deal CRM gắn dự án — dùng lọc công ty đặt hàng ngoài (ext:). */
  crm_deals?: Array<{
    id?: string;
    type?: string;
    title?: string | null;
    region_id?: string | null;
    external_company_name?: string | null;
    external_catalog_id?: string | null;
    assignee?: { id?: string; full_name?: string } | null;
    lead_owner?: { id?: string; full_name?: string } | null;
  }>;
};

/** Cột Planner cá nhân (sx_user_planner_columns). */
export type PlannerColumn = {
  id: string;
  name: string;
  color?: string | null;
  position?: number;
};

/** Item Planner cá nhân (sx_user_planner_items) — tham chiếu project_id. */
export type PlannerItem = {
  id: string;
  column_id: string;
  project_id: string;
  position?: number;
};

export type PersonalPlanner = {
  columns: PlannerColumn[];
  items: PlannerItem[];
};

export type ProductionDashboard = {
  total_projects: number;
  producing?: number;
  shipping?: number;
  installing?: number;
  warranty?: number;
  delivering?: number;
  customer_care?: number;
  completed: number;
  overdue: number;
  intake_pending?: number;
  total_value: number;
  avg_progress: number;
};

export type ProductionBoard = {
  stages: KanbanStage[];
  projects: ProductionProject[];
  kpis: ProductionDashboard | null;
};

export type PersonRef = {
  id?: string;
  full_name?: string | null;
  avatar?: string | null;
  email?: string | null;
};

export type ProductionProjectDetail = ProductionProject & {
  description?: string | null;
  notes?: string | null;
  production_deadline?: string | null;
  productionTaskProgress?: number;
  taskProgress?: number;
  sxKanbanStages?: KanbanStage[];
  vcKanbanStages?: KanbanStage[];
  crmDeals?: CrmDealSummary[];
  sharedDocuments?: unknown[];
  customer?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  company?: { id?: string; name?: string; short_name?: string | null } | null;
  workshop_type?: { id?: string; name?: string | null } | null;
  sales_person?: PersonRef | null;
  project_manager?: PersonRef | null;
  supervisor?: PersonRef | null;
  production_person?: PersonRef | null;
  logistics_person?: PersonRef | null;
  installer_person?: PersonRef | null;
  shipping_person?: PersonRef | null;
  care_person?: PersonRef | null;
  current_stage?: { id?: string; slug?: string; name?: string; color?: string | null } | null;
};

export type CrmDealSummary = {
  id: string;
  code?: string | null;
  title?: string | null;
  assignee?: PersonRef | null;
  lead_owner?: PersonRef | null;
  sx_pipeline_stage?: { id?: string; name?: string | null } | null;
};

/** Ghi chú nhân viên nhập trên nhiệm vụ (không phải mô tả/template). */
export type TaskStaffNote = {
  id: string;
  text: string;
  created_at?: string | null;
  user_name?: string | null;
};

export type CrmTask = {
  id: string;
  title: string;
  status: string;
  stage_slug?: string | null;
  order_index?: number;
  deadline?: string | null;
  due_date?: string | null;
  /** Ghi chú nhân viên (preview / CRM inline). Mô tả mẫu nằm ở `description`. */
  notes?: string | null;
  description?: string | null;
  priority?: string | null;
  file_count?: number;
  note_count?: number;
  attachment_count?: number;
  /** Danh sách ghi chú đã tải (workshop comments / CRM task_note). */
  staff_notes?: TaskStaffNote[];
  assignee?: PersonRef | null;
  assignees?: PersonRef[];
  pipeline_stage?: { id?: string; name?: string | null; order_index?: number } | null;
  logistics_pipeline_stage_id?: string | null;
  logistics_pipeline_stage?: { id?: string; name?: string | null; order_index?: number; bucket_slug?: string | null } | null;
  metadata?: Record<string, unknown> | null;
  _workshop_project_task?: boolean;
  /** crm = crm_tasks trên deal; workshop = bảng tasks (bộ mẫu VC/LĐ) */
  source?: 'crm' | 'workshop';
};

export type ProjectActivity = {
  id: string;
  title?: string | null;
  content?: string | null;
  created_at: string;
  user?: PersonRef | null;
};
