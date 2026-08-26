-- ═══════════════════════════════════════════════════════════════════════════════
-- 572 — Phân trang/lọc phía server cho 3 view còn lại của /projects
--        (Danh sách · Lịch · Theo hạn)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--     Chạy SAU migration 570/571.
--
-- BỐI CẢNH
-- --------
-- Migration 570/571 đã lo Kanban. Ba view còn lại vẫn dùng đường cũ
-- `GET /api/projects?limit=500` nên vẫn:
--   • bị giới hạn 500 → hiện đang bỏ 69/569 dự án, ở 8.000 thì bỏ 94%
--   • nặng tuyến tính theo tổng số dự án (~1,1ms + ~4,4KB mỗi dự án)
--
-- BA HÀM
-- ------
--   project_list_page(...)     → Danh sách: id 1 trang + tổng   (mode phẳng, không theo cột)
--   project_dates_in_range(...)→ Lịch: id có BẤT KỲ mốc ngày nào rơi trong [from, to]
--   project_deadline_board(...)→ Theo hạn: đếm 6 nhóm, hoặc id 1 trang của 1 nhóm
--
-- Bộ lọc (công ty/khách/người/tìm kiếm/khoảng tạo) dùng CHUNG một khối điều kiện, khớp
-- y hệt migration 570/571 — sửa một bên phải sửa các bên còn lại.
--
-- MỐC NGÀY CỦA "THEO HẠN"
-- -----------------------
-- Biên nhóm do CLIENT truyền vào (`p_bounds`) thay vì tính trong SQL, để tránh lệch múi
-- giờ: frontend đang tính theo giờ máy người dùng.
--   p_bounds = [today, tomorrow, dayAfterTomorrow, endOfNextWeek, endOfNextMonth]
-- Ngày dùng để phân nhóm: COALESCE(deadline, design_deadline, install_date) — khớp getD().
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ tạo function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Danh sách phẳng, có phân trang ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_list_page(
  p_company_ids   uuid[]        DEFAULT NULL,
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_date_from     timestamptz   DEFAULT NULL,
  p_date_to       timestamptz   DEFAULT NULL,
  p_offset        integer       DEFAULT 0,
  p_limit         integer       DEFAULT 100,
  p_tenant_company_ids uuid[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT p.id, p.created_at
  FROM projects p
  WHERE (p_company_ids IS NULL OR p.company_id = ANY (p_company_ids))
    AND (p_tenant_company_ids IS NULL OR cardinality(p_tenant_company_ids) = 0
         OR p.company_id = ANY (p_tenant_company_ids)
         OR p.logistics_company_id = ANY (p_tenant_company_ids))
    AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
    AND (p_date_from IS NULL OR p.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR p.created_at <= p_date_to)
    AND (NULLIF(TRIM(COALESCE(p_search, '')), '') IS NULL
         OR p.code ILIKE ('%' || TRIM(p_search) || '%')
         OR p.name ILIKE ('%' || TRIM(p_search) || '%'))
    AND (p_person_id IS NULL
         OR p.sales_person_id = p_person_id OR p.designer_id = p_person_id
         OR p.project_manager_id = p_person_id OR p.consulting_person_id = p_person_id
         OR p.design_person_id = p_person_id OR p.quotation_person_id = p_person_id
         OR p.contract_person_id = p_person_id OR p.production_person_id = p_person_id
         OR p.shipping_person_id = p_person_id OR p.installation_person_id = p_person_id
         OR p.care_person_id = p_person_id OR p.supervisor_id = p_person_id
         OR p.created_by = p_person_id::text
         OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = p_person_id))
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM base),
  'ids', COALESCE((SELECT jsonb_agg(x.id ORDER BY x.created_at DESC)
                     FROM (SELECT id, created_at FROM base
                            ORDER BY created_at DESC
                            OFFSET GREATEST(p_offset, 0)
                            LIMIT LEAST(GREATEST(p_limit, 1), 500)) x), '[]'::jsonb)
);
$$;

-- ── 2. Lịch: dự án có BẤT KỲ mốc ngày nào trong khoảng ────────────────────────
-- Các cột mốc khớp `p.dates` mà bước enrich đang dựng.
CREATE OR REPLACE FUNCTION public.project_dates_in_range(
  p_from          timestamptz,
  p_to            timestamptz,
  p_company_ids   uuid[]        DEFAULT NULL,
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_limit         integer       DEFAULT 500,
  p_tenant_company_ids uuid[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
  SELECT p.id, p.created_at
  FROM projects p
  WHERE (p_company_ids IS NULL OR p.company_id = ANY (p_company_ids))
    AND (p_tenant_company_ids IS NULL OR cardinality(p_tenant_company_ids) = 0
         OR p.company_id = ANY (p_tenant_company_ids)
         OR p.logistics_company_id = ANY (p_tenant_company_ids))
    AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
    AND (NULLIF(TRIM(COALESCE(p_search, '')), '') IS NULL
         OR p.code ILIKE ('%' || TRIM(p_search) || '%')
         OR p.name ILIKE ('%' || TRIM(p_search) || '%'))
    AND (p_person_id IS NULL
         OR p.sales_person_id = p_person_id OR p.designer_id = p_person_id
         OR p.project_manager_id = p_person_id OR p.consulting_person_id = p_person_id
         OR p.design_person_id = p_person_id OR p.quotation_person_id = p_person_id
         OR p.contract_person_id = p_person_id OR p.production_person_id = p_person_id
         OR p.shipping_person_id = p_person_id OR p.installation_person_id = p_person_id
         OR p.care_person_id = p_person_id OR p.supervisor_id = p_person_id
         OR p.created_by = p_person_id::text
         OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = p_person_id))
    AND (
      (p.deadline             >= p_from AND p.deadline             <= p_to)
      OR (p.design_deadline      >= p_from AND p.design_deadline      <= p_to)
      OR (p.production_deadline  >= p_from AND p.production_deadline  <= p_to)
      OR (p.order_date::timestamptz    >= p_from AND p.order_date::timestamptz    <= p_to)
      OR (p.delivery_date::timestamptz >= p_from AND p.delivery_date::timestamptz <= p_to)
      OR (p.install_date::timestamptz  >= p_from AND p.install_date::timestamptz  <= p_to)
    )
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM base),
  'ids', COALESCE((SELECT jsonb_agg(x.id ORDER BY x.created_at DESC)
                     FROM (SELECT id, created_at FROM base
                            ORDER BY created_at DESC
                            LIMIT LEAST(GREATEST(p_limit, 1), 1000)) x), '[]'::jsonb)
);
$$;

-- ── 3. Theo hạn: đếm 6 nhóm, hoặc 1 trang của 1 nhóm ─────────────────────────
CREATE OR REPLACE FUNCTION public.project_deadline_board(
  p_bounds        timestamptz[],                 -- [today, tomorrow, d+2, endNextWeek, endNextMonth]
  p_mode          text          DEFAULT 'summary',
  p_bucket        text          DEFAULT NULL,
  p_company_ids   uuid[]        DEFAULT NULL,
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_offset        integer       DEFAULT 0,
  p_limit         integer       DEFAULT 40,
  p_tenant_company_ids uuid[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH b AS (
  SELECT p_bounds[1] AS d0, p_bounds[2] AS d1, p_bounds[3] AS d2,
         p_bounds[4] AS d3, p_bounds[5] AS d4
),
base AS (
  SELECT p.id, p.created_at, p.status::text AS status,
         COALESCE(p.deadline, p.design_deadline, p.install_date::timestamptz) AS d
  FROM projects p
  WHERE (p_company_ids IS NULL OR p.company_id = ANY (p_company_ids))
    AND (p_tenant_company_ids IS NULL OR cardinality(p_tenant_company_ids) = 0
         OR p.company_id = ANY (p_tenant_company_ids)
         OR p.logistics_company_id = ANY (p_tenant_company_ids))
    AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
    AND (NULLIF(TRIM(COALESCE(p_search, '')), '') IS NULL
         OR p.code ILIKE ('%' || TRIM(p_search) || '%')
         OR p.name ILIKE ('%' || TRIM(p_search) || '%'))
    AND (p_person_id IS NULL
         OR p.sales_person_id = p_person_id OR p.designer_id = p_person_id
         OR p.project_manager_id = p_person_id OR p.consulting_person_id = p_person_id
         OR p.design_person_id = p_person_id OR p.quotation_person_id = p_person_id
         OR p.contract_person_id = p_person_id OR p.production_person_id = p_person_id
         OR p.shipping_person_id = p_person_id OR p.installation_person_id = p_person_id
         OR p.care_person_id = p_person_id OR p.supervisor_id = p_person_id
         OR p.created_by = p_person_id::text
         OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.assignee_id = p_person_id))
),
-- Khớp đúng DEADLINE_COLS phía frontend
bucketed AS (
  SELECT base.*, CASE
    WHEN base.d IS NOT NULL AND base.d <  (SELECT d0 FROM b) AND base.status <> 'completed' THEN 'overdue'
    WHEN base.d >= (SELECT d0 FROM b) AND base.d < (SELECT d1 FROM b) THEN 'today'
    WHEN base.d >= (SELECT d1 FROM b) AND base.d < (SELECT d2 FROM b) THEN 'tomorrow'
    WHEN base.d >= (SELECT d2 FROM b) AND base.d < (SELECT d3 FROM b) THEN 'next_week'
    WHEN base.d >= (SELECT d3 FROM b) AND base.d < (SELECT d4 FROM b) THEN 'next_month'
    ELSE 'later'
  END AS bucket
  FROM base
)
SELECT CASE
  WHEN p_mode = 'page' THEN
    (SELECT jsonb_build_object(
       'ids', COALESCE((SELECT jsonb_agg(x.id ORDER BY x.created_at DESC)
                          FROM (SELECT id, created_at FROM bucketed
                                 WHERE bucket = p_bucket
                                 ORDER BY created_at DESC
                                 OFFSET GREATEST(p_offset, 0)
                                 LIMIT LEAST(GREATEST(p_limit, 1), 200)) x), '[]'::jsonb),
       'has_more', (SELECT count(*) FROM bucketed WHERE bucket = p_bucket) > (p_offset + p_limit),
       'total', (SELECT count(*) FROM bucketed WHERE bucket = p_bucket)))
  ELSE
    (SELECT jsonb_build_object(
       'total', (SELECT count(*) FROM bucketed),
       'counts', COALESCE((SELECT jsonb_object_agg(g.bucket, g.n)
                             FROM (SELECT bucket, count(*) AS n FROM bucketed GROUP BY bucket) g),
                          '{}'::jsonb)))
END;
$$;

-- SECURITY DEFINER: thu hồi EXECUTE mặc định của PUBLIC trước khi cấp cho service_role.
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('project_list_page', 'project_dates_in_range', 'project_deadline_board')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

-- ── Kiểm tra sau khi chạy ─────────────────────────────────────────────────────
--   SELECT public.project_list_page(p_limit := 100) -> 'total';        -- = tổng dự án
--   SELECT jsonb_array_length(public.project_list_page(p_limit := 100) -> 'ids');  -- = 100
--   SELECT public.project_deadline_board(ARRAY[now(),now(),now(),now(),now()]) -> 'counts';
