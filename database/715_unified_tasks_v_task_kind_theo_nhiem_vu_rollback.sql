-- ══════════════════════════════════════════════════════════════════════════
-- 715 ROLLBACK — trả unified_tasks_v về đúng biểu thức task_kind của bản 594
-- (suy làn theo thuộc tính DỰ ÁN, bỏ hai nhánh đọc metadata.workshop_area).
--
-- Chỉ đổi lại biểu thức task_kind; cột/kiểu/thứ tự/nhánh UNION không đổi
-- nên CREATE OR REPLACE VIEW chạy được, không cần DROP.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.unified_tasks_v AS
-- ── 1a. task × lead chính ────────────────────────────────────────────────
 SELECT 'task:'::text || t.id::text AS unified_id,
    'task'::unified_task_source AS source,
    t.id::text AS source_id,
    t.project_id, cl.id AS lead_id,
    COALESCE(p.company_id, cl.company_id) AS company_id,
    t.title, t.description,
    t.status::text AS status, t.priority::text AS priority,
    t.assignee_id, t.due_date AS deadline, t.completed_at,
    t.created_by_id, t.created_at, t.updated_at,
        CASE
            WHEN COALESCE(t.task_type, 'project'::character varying)::text = 'personal'::text OR t.project_id IS NULL THEN 'Cá nhân'::text
            WHEN p.production_person_id IS NOT NULL OR t.production_stage_id IS NOT NULL THEN 'SX'::text
            WHEN p.vc_kanban_column_id IS NOT NULL OR p.logistics_company_id IS NOT NULL THEN 'VC'::text
            ELSE 'Dự án'::text
        END AS task_kind,
    p.code AS project_code, p.name AS project_name, cl.title AS lead_title,
    true AS is_primary_lead
   FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN (
       SELECT DISTINCT ON (c.project_id) c.project_id, c.id, c.company_id, c.title
         FROM crm_leads c WHERE c.project_id IS NOT NULL
        ORDER BY c.project_id, c.created_at NULLS LAST, c.id
     ) cl ON cl.project_id = t.project_id
UNION ALL
-- ── 1b. task × lead thứ 2..N (dòng phụ, chỉ dùng khi lọc theo lead) ──────
 SELECT 'task:'::text || t.id::text AS unified_id,
    'task'::unified_task_source AS source,
    t.id::text AS source_id,
    t.project_id, cl.id AS lead_id,
    COALESCE(p.company_id, cl.company_id) AS company_id,
    t.title, t.description,
    t.status::text AS status, t.priority::text AS priority,
    t.assignee_id, t.due_date AS deadline, t.completed_at,
    t.created_by_id, t.created_at, t.updated_at,
        CASE
            WHEN COALESCE(t.task_type, 'project'::character varying)::text = 'personal'::text OR t.project_id IS NULL THEN 'Cá nhân'::text
            WHEN p.production_person_id IS NOT NULL OR t.production_stage_id IS NOT NULL THEN 'SX'::text
            WHEN p.vc_kanban_column_id IS NOT NULL OR p.logistics_company_id IS NOT NULL THEN 'VC'::text
            ELSE 'Dự án'::text
        END AS task_kind,
    p.code AS project_code, p.name AS project_name, cl.title AS lead_title,
    false AS is_primary_lead
   FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     JOIN crm_leads cl ON cl.project_id = t.project_id
     JOIN (
       SELECT DISTINCT ON (c.project_id) c.project_id, c.id AS primary_lead_id
         FROM crm_leads c WHERE c.project_id IS NOT NULL
        ORDER BY c.project_id, c.created_at NULLS LAST, c.id
     ) pl ON pl.project_id = t.project_id AND cl.id <> pl.primary_lead_id
UNION ALL
-- ── 2. crm_tasks ─────────────────────────────────────────────────────────
 SELECT 'crm_task:'::text || ct.id::text AS unified_id,
    'crm_task'::unified_task_source AS source,
    ct.id::text AS source_id,
    cl.project_id, ct.lead_id, cl.company_id,
    ct.title, ct.description, ct.status, ct.priority, ct.assignee_id,
    ct.deadline, ct.completed_at,
    ct.created_by AS created_by_id, ct.created_at, ct.updated_at,
        CASE
            WHEN cl.project_id IS NOT NULL OR COALESCE(ps.is_won, false) THEN 'CRM-Deal'::text
            WHEN COALESCE(ps.pipeline_type, 'lead'::text) = 'deal'::text THEN 'CRM-Deal'::text
            ELSE 'CRM-Lead'::text
        END AS task_kind,
    p.code AS project_code, p.name AS project_name, cl.title AS lead_title,
    true AS is_primary_lead
   FROM crm_tasks ct
     JOIN crm_leads cl ON cl.id = ct.lead_id
     LEFT JOIN crm_pipeline_stages ps ON ps.id = cl.stage_id
     LEFT JOIN projects p ON p.id = cl.project_id
UNION ALL
-- ── 3. crm_assignments ───────────────────────────────────────────────────
 SELECT 'crm_assignment:'::text || ca.id::text AS unified_id,
    'crm_assignment'::unified_task_source AS source,
    ca.id::text AS source_id,
    NULL::uuid AS project_id, NULL::uuid AS lead_id, ca.company_id,
    ca.title, ca.description,
    ca.status::text AS status, ca.priority::text AS priority,
    ca.assignee_id, ca.deadline, ca.completed_at, ca.created_by_id,
    ca.created_at, ca.updated_at,
    'Giao việc'::text AS task_kind,
    NULL::character varying AS project_code,
    NULL::character varying AS project_name,
    NULL::text AS lead_title,
    true AS is_primary_lead
   FROM crm_assignments ca;

COMMENT ON VIEW public.unified_tasks_v IS
  'Khung nhìn gộp task/crm_task/crm_assignment. is_primary_lead = đúng một dòng cho mỗi unified_id. Liệt kê/đếm KHÔNG bám theo lead ⇒ thêm is_primary_lead = true (nhánh dòng phụ bị loại ngay lúc lập kế hoạch). Lọc theo lead_id thì KHÔNG thêm, nếu không task của lead thứ 2 sẽ biến mất.';
