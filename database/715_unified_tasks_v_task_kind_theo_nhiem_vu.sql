-- ══════════════════════════════════════════════════════════════════════════
-- 715 — unified_tasks_v: task_kind phân làn theo TỪNG NHIỆM VỤ, không theo dự án
-- Ngày: 08/10/2026
--
-- VẤN ĐỀ
--   Bản 594 suy task_kind từ thuộc tính DỰ ÁN:
--       WHEN p.production_person_id IS NOT NULL OR t.production_stage_id IS NOT NULL THEN 'SX'
--       WHEN p.vc_kanban_column_id IS NOT NULL OR p.logistics_company_id IS NOT NULL THEN 'VC'
--   Dự án nào đã gán người phụ trách SX thì MỌI nhiệm vụ của nó thành 'SX', kể cả
--   việc vận chuyển – lắp đặt do bộ mẫu VC/LĐ sinh ra. Đo ngày 08/10/2026:
--   124 dự án HCB ở cột «ĐƠN HÀNG ĐÃ GIAO» có 874 việc còn mở, trong đó 717 việc
--   thực chất là VC/LĐ nhưng đều mang nhãn 'SX' ⇒ đội vận chuyển không thấy việc
--   của mình ở tab VC, còn tab Sản xuất thì đầy việc không phải của xưởng.
--
-- CÁCH SỬA
--   Chèn hai nhánh đọc `tasks.metadata->>'workshop_area'` LÊN TRƯỚC, phần còn lại
--   giữ nguyên y như 594. Nhiệm vụ không có workshop_area thì hành vi không đổi.
--   `workshop_area` do helpers/workshopApplyTemplates.js ghi lúc sinh việc từ bộ mẫu
--   ('production' | 'logistics'), cùng nguồn với helpers/logisticsTaskSplit.js.
--
-- SỨC ẢNH HƯỞNG (đo trên dữ liệu thật trước khi áp, 22.631 dòng bảng tasks)
--   đổi làn 5.026 việc (3.881 còn mở):
--       SX → VC     4.821      Dự án → SX   138
--       VC → SX        54      Dự án → VC    13
--   theo công ty (việc còn mở): Hucabi 2.975 · Metalla 373 · Phúc Đạt 299 · NextGo 234
--
-- NƠI CHỊU ẢNH HƯỞNG (đọc task_kind):
--   backend/src/routes/workTasks.js (làn SX = 'SX','Dự án'; làn VC = 'VC')
--   backend/src/routes/management.js:2155, :863
--   backend/src/helpers/unifiedTasksQuery.js:116
--   backend/src/helpers/projectDealBundle.js:1231,1239 — đã tự phân làn theo
--     metadata khi có dòng gốc, nên sẽ KHỚP hơn sau khi áp bản này.
--
-- Chỉ đổi biểu thức task_kind. Không đổi cột, kiểu, thứ tự cột hay nhánh UNION,
-- nên CREATE OR REPLACE VIEW chạy được mà không cần DROP.
-- Hoàn tác: chạy 715_..._rollback.sql (trả về đúng biểu thức của 594).
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
            WHEN lower(t.metadata ->> 'workshop_area'::text) = 'logistics'::text THEN 'VC'::text
            WHEN lower(t.metadata ->> 'workshop_area'::text) = 'production'::text THEN 'SX'::text
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
            WHEN lower(t.metadata ->> 'workshop_area'::text) = 'logistics'::text THEN 'VC'::text
            WHEN lower(t.metadata ->> 'workshop_area'::text) = 'production'::text THEN 'SX'::text
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
-- ── 2. crm_tasks (không đổi) ─────────────────────────────────────────────
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
-- ── 3. crm_assignments (không đổi) ───────────────────────────────────────
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
  'Khung nhìn gộp task/crm_task/crm_assignment. task_kind của nhánh task phân làn theo metadata.workshop_area của TỪNG nhiệm vụ (715), chỉ khi thiếu mới suy theo dự án như cũ. is_primary_lead = đúng một dòng cho mỗi unified_id. Liệt kê/đếm KHÔNG bám theo lead ⇒ thêm is_primary_lead = true (nhánh dòng phụ bị loại ngay lúc lập kế hoạch). Lọc theo lead_id thì KHÔNG thêm, nếu không task của lead thứ 2 sẽ biến mất.';
