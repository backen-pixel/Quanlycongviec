-- 629: Gộp phần "việc cần làm hôm nay / quá hạn" của trang Tổng quan công việc về một lượt gọi.
--
-- Trước đây backend bắn 2 truy vấn (theo project_id và theo lead_id), kéo TOÀN BỘ dòng khớp
-- về Node (569 dòng cho mục quá hạn) chỉ để đếm rồi cắt lấy 50 dòng đầu. Hàm này đếm và cắt
-- ngay trong database, trả về đúng số cần hiện.
--
-- Giữ nguyên ngữ nghĩa của code JS đang chạy:
--   * nhánh project_id: lọc is_primary_lead (khử dòng nhân khi dự án có nhiều deal — MIG 594)
--   * nhánh lead_id   : KHÔNG lọc is_primary_lead (đang bám theo lead cụ thể)
--   * bỏ task đã xong  : status not in (done, completed, cancelled)
--   * bỏ loại không hiện trên tổng quan: task_kind not in ('CRM-Lead', 'Cá nhân')
--   * bắt buộc có deadline, nằm trong khoảng [p_deadline_gte, p_deadline_lte]
--   * khử trùng theo unified_id, ưu tiên dòng đến từ nhánh project (giống Map "first wins")
--   * sắp xếp theo deadline tăng dần
--
-- p_company_ids: NULL/mảng rỗng = không giới hạn công ty (khớp applyCompanyScopeFilter khi
-- scope không chỉ định công ty nào).

-- CREATE OR REPLACE không đổi được kiểu trả về nếu function đã tồn tại → drop trước cho
-- chạy lại migration nhiều lần đều được.
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
-- Kiểu thật trong unified_tasks_v: source là enum unified_task_source, source_id là text,
-- title/project_code/project_name là varchar. Ép kiểu tường minh ở dưới để khai báo này
-- luôn đúng, khỏi phụ thuộc kiểu gốc của view.
RETURNS TABLE (
  total_count  bigint,
  unified_id   text,
  source       text,
  source_id    text,
  project_id   uuid,
  lead_id      uuid,
  title        text,
  status       text,
  deadline     timestamptz,
  assignee_id  uuid,
  task_kind    text,
  project_code text,
  project_name text,
  lead_title   text
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
    d.status, d.deadline, d.assignee_id, d.task_kind,
    d.project_code, d.project_name, d.lead_title
  FROM deduped d
  ORDER BY d.deadline ASC, d.unified_id ASC
  LIMIT GREATEST(p_limit, 0);
$$;

COMMENT ON FUNCTION public.work_overview_tasks IS
  'Tổng quan công việc: đếm tổng + trả top N việc theo hạn, gộp nhánh project_id và lead_id.';

GRANT EXECUTE ON FUNCTION public.work_overview_tasks(
  uuid[], uuid[], uuid[], timestamptz, timestamptz, integer
) TO authenticated, service_role;
