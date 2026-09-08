-- ══════════════════════════════════════════════════════════════════════════
-- 593 — unified_tasks_v: thêm cột is_primary_lead ở CUỐI  (LẦN THỬ 1)
-- Ngày: 08/09/2026
--
-- ⚠ ĐÃ BỊ 594 THAY THẾ TRONG CÙNG NGÀY. Giữ lại để chạy lại đúng thứ tự và để
--   lưu số đo. Cách viết dưới đây khử trùng ĐÚNG nhưng làm hỏng kế hoạch:
--     trước: 259 ms / 9.022 buffers
--     sau  : 169 ms / 48.696 buffers  ← ước lượng tụt còn rows=2 nên planner
--            đổi Hash Join thành Nested Loop trên projects_pkey, 13.139 vòng.
--   Lý do: lọc trên một biểu thức boolean tính từ join thì planner không ước
--   lượng được. 594 tách thành nhánh UNION riêng để tránh hẳn chuyện đó.
--
-- Vì sao nhân dòng: nhánh `tasks` nối LEFT JOIN crm_leads ON cl.project_id =
-- t.project_id, mà crm_leads.project_id KHÔNG duy nhất.
--   Đo được: 127.279 dòng / 124.941 unified_id  → 2.338 dòng thừa.
--   703 lead có project_id, 49 dự án có >1 lead, nhiều nhất 4 lead/dự án.
-- ══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.unified_tasks_v AS
 SELECT 'task:'::text || t.id::text AS unified_id,
    'task'::unified_task_source AS source,
    t.id::text AS source_id,
    t.project_id,
    cl.id AS lead_id,
    COALESCE(p.company_id, cl.company_id) AS company_id,
    t.title, t.description,
    t.status::text AS status,
    t.priority::text AS priority,
    t.assignee_id,
    t.due_date AS deadline,
    t.completed_at, t.created_by_id, t.created_at, t.updated_at,
        CASE
            WHEN COALESCE(t.task_type, 'project'::character varying)::text = 'personal'::text OR t.project_id IS NULL THEN 'Cá nhân'::text
            WHEN p.production_person_id IS NOT NULL OR t.production_stage_id IS NOT NULL THEN 'SX'::text
            WHEN p.vc_kanban_column_id IS NOT NULL OR p.logistics_company_id IS NOT NULL THEN 'VC'::text
            ELSE 'Dự án'::text
        END AS task_kind,
    p.code AS project_code, p.name AS project_name, cl.title AS lead_title,
    (cl.id IS NULL OR cl.id = pl.primary_lead_id) AS is_primary_lead
   FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN crm_leads cl ON cl.project_id = t.project_id
     LEFT JOIN (
       SELECT DISTINCT ON (c.project_id) c.project_id, c.id AS primary_lead_id
         FROM crm_leads c WHERE c.project_id IS NOT NULL
        ORDER BY c.project_id, c.created_at NULLS LAST, c.id
     ) pl ON pl.project_id = t.project_id
UNION ALL
 SELECT 'crm_task:'::text || ct.id::text AS unified_id,
    'crm_task'::unified_task_source AS source,
    ct.id::text AS source_id,
    cl.project_id, ct.lead_id, cl.company_id,
    ct.title, ct.description, ct.status, ct.priority, ct.assignee_id,
    ct.deadline, ct.completed_at,
    ct.created_by AS created_by_id,
    ct.created_at, ct.updated_at,
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
