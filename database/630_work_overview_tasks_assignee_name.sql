-- 630: Gộp nốt lượt tra tên người phụ trách vào work_overview_tasks.
--
-- Trước đây backend gọi RPC lấy 50 dòng việc, ĐỢI kết quả rồi mới bắn thêm một truy vấn
-- `users?id=in.(...)` chỉ để đổi assignee_id thành tên. Lượt đó nằm cuối đường tới hạn của
-- /api/management/work-overview nên cộng thẳng ~170ms (dev) / ~350ms (production) vào thời
-- gian tải trang. LEFT JOIN ngay trong hàm thì không tốn thêm vòng đi–về nào.
--
-- Ngoài cột assignee_name mới, hàm giữ NGUYÊN ngữ nghĩa của bản 629.
--
-- users.full_name là character varying → ép ::text cho khớp khai báo RETURNS TABLE.

DROP FUNCTION IF EXISTS public.work_overview_tasks(
  uuid[], uuid[], uuid[], timestamptz, timestamptz, integer
);

CREATE FUNCTION public.work_overview_tasks(
  p_project_ids  uuid[],
  p_lead_ids     uuid[],
  p_company_ids  uuid[],
  p_deadline_gte timestamptz,
  p_deadline_lte timestamptz,
  p_limit        integer DEFAULT 50
)
RETURNS TABLE (
  total_count   bigint,
  unified_id    text,
  source        text,
  source_id     text,
  project_id    uuid,
  lead_id       uuid,
  title         text,
  status        text,
  deadline      timestamptz,
  assignee_id   uuid,
  assignee_name text,
  task_kind     text,
  project_code  text,
  project_name  text,
  lead_title    text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      t.unified_id::text    AS unified_id,
      t.source::text        AS source,
      t.source_id::text     AS source_id,
      t.project_id,
      t.lead_id,
      t.title::text         AS title,
      t.status::text        AS status,
      t.deadline,
      t.assignee_id,
      t.task_kind::text     AS task_kind,
      t.project_code::text  AS project_code,
      t.project_name::text  AS project_name,
      t.lead_title::text    AS lead_title,
      -- 0 = nhánh project (được ưu tiên giữ khi trùng unified_id), 1 = nhánh lead
      0 AS branch
    FROM public.unified_tasks_v t
    WHERE p_project_ids IS NOT NULL
      AND array_length(p_project_ids, 1) > 0
      AND t.project_id = ANY (p_project_ids)
      AND t.is_primary_lead IS TRUE
      AND t.status NOT IN ('done', 'completed', 'cancelled')
      AND t.task_kind IS DISTINCT FROM 'CRM-Lead'
      AND t.task_kind IS DISTINCT FROM 'Cá nhân'
      AND t.deadline IS NOT NULL
      AND (p_deadline_gte IS NULL OR t.deadline >= p_deadline_gte)
      AND (p_deadline_lte IS NULL OR t.deadline <= p_deadline_lte)
      AND (p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL
           OR t.company_id = ANY (p_company_ids))

    UNION ALL

    SELECT
      t.unified_id::text    AS unified_id,
      t.source::text        AS source,
      t.source_id::text     AS source_id,
      t.project_id,
      t.lead_id,
      t.title::text         AS title,
      t.status::text        AS status,
      t.deadline,
      t.assignee_id,
      t.task_kind::text     AS task_kind,
      t.project_code::text  AS project_code,
      t.project_name::text  AS project_name,
      t.lead_title::text    AS lead_title,
      1 AS branch
    FROM public.unified_tasks_v t
    WHERE p_lead_ids IS NOT NULL
      AND array_length(p_lead_ids, 1) > 0
      AND t.lead_id = ANY (p_lead_ids)
      AND t.status NOT IN ('done', 'completed', 'cancelled')
      AND t.task_kind IS DISTINCT FROM 'CRM-Lead'
      AND t.task_kind IS DISTINCT FROM 'Cá nhân'
      AND t.deadline IS NOT NULL
      AND (p_deadline_gte IS NULL OR t.deadline >= p_deadline_gte)
      AND (p_deadline_lte IS NULL OR t.deadline <= p_deadline_lte)
      AND (p_company_ids IS NULL OR array_length(p_company_ids, 1) IS NULL
           OR t.company_id = ANY (p_company_ids))
  ),
  deduped AS (
    SELECT DISTINCT ON (s.unified_id) s.*
    FROM scoped s
    ORDER BY s.unified_id, s.branch
  )
  SELECT
    COUNT(*) OVER () AS total_count,
    d.unified_id, d.source, d.source_id, d.project_id, d.lead_id, d.title,
    d.status, d.deadline, d.assignee_id,
    u.full_name::text AS assignee_name,
    d.task_kind, d.project_code, d.project_name, d.lead_title
  FROM deduped d
  LEFT JOIN public.users u ON u.id = d.assignee_id
  ORDER BY d.deadline ASC, d.unified_id ASC
  LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.work_overview_tasks IS
  'Tổng quan công việc: đếm tổng + trả top N việc theo hạn (kèm tên người phụ trách), gộp nhánh project_id và lead_id.';

GRANT EXECUTE ON FUNCTION public.work_overview_tasks(
  uuid[], uuid[], uuid[], timestamptz, timestamptz, integer
) TO authenticated, service_role;
