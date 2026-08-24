-- 561: Gộp việc phân trang nhiều cột Kanban Sản xuất vào 1 RPC (giống
-- crm_kanban_stage_page_ids / migration 475), thay cho việc mỗi cột gọi 2 query REST
-- (id-page rồi hydrate) + luôn phải nhét sẵn TOÀN BỘ danh sách "project đã thắng deal"
-- (wonIds, tính ở Node) vào filter `id.in.(...)`.
--
-- Vấn đề cũ: wonIds tăng gần tuyến tính theo tổng số dự án lịch sử của công ty (ví dụ công ty
-- HCB hiện đã ~300 id cho ~420 dự án). Ở quy mô ~3000 dự án, danh sách này có thể lên ~2000 id,
-- chuỗi filter `id.in.(...)` gửi cho MỖI cột (6-8 cột/lượt mở board) phình lên hàng chục KB,
-- vừa chậm vừa có nguy cơ vượt giới hạn độ dài query của tầng hạ tầng Supabase.
--
-- Fix: kiểm tra "dự án này có phải đã thắng deal / gắn deal không" NGAY TRONG SQL bằng EXISTS
-- (join qua index), không còn cần mảng id nào cho phần này — quy mô không phụ thuộc số dự án.
-- Dựa theo đúng logic getWonDealProjectIds() (backend/src/helpers/workshopKanban.js): một dự án
-- được coi là "đã thắng/gắn deal" nếu có ÍT NHẤT MỘT deal (crm_leads.type='deal') trỏ project_id
-- này, HOẶC được gắn qua bảng nối multi-xưởng crm_deal_projects — không cần phân biệt is_won /
-- actual_close_date vì query "chỉ cần có project_id" trong bản gốc đã là tập cha của 2 điều kiện
-- kia (xem comment trong workshopKanban.js).
--
-- ⚠️ Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.

-- Index cho vế EXISTS (crm_leads chưa có index theo project_id).
CREATE INDEX IF NOT EXISTS idx_crm_leads_deal_project_id
  ON crm_leads (project_id)
  WHERE type = 'deal' AND project_id IS NOT NULL;

-- Xóa bản đã tạo ở lượt chạy trước (có p_division_id — cột không tồn tại trên projects) để
-- CREATE OR REPLACE bên dưới không bị coi là chữ ký khác → lỗi "function name is not unique".
DROP FUNCTION IF EXISTS public.sx_kanban_stage_page_ids(
  jsonb, uuid[], text[], uuid, uuid[], uuid[], uuid[], uuid, boolean, uuid, timestamptz, timestamptz, uuid, text, text
);

CREATE OR REPLACE FUNCTION public.sx_kanban_stage_page_ids(
  p_requests jsonb DEFAULT '[]'::jsonb,
  p_stage_ids uuid[] DEFAULT NULL,
  p_statuses text[] DEFAULT ARRAY['producing', 'shipping', 'installing', 'warranty', 'completed']::text[],
  p_company_id uuid DEFAULT NULL,
  p_partner_project_ids uuid[] DEFAULT NULL,
  p_restrict_project_ids uuid[] DEFAULT NULL,
  p_tenant_company_ids uuid[] DEFAULT NULL,
  p_workshop_type_id uuid DEFAULT NULL,
  p_unclassified boolean DEFAULT false,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL,
  p_production_person_id uuid DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_result jsonb;
BEGIN
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  WITH raw_requests AS (
    SELECT
      value->>'column_id' AS column_text,
      COALESCE((value->>'null_column')::boolean, false) AS null_column,
      GREATEST(COALESCE((value->>'offset')::integer, 0), 0) AS offset_value,
      LEAST(GREATEST(COALESCE((value->>'limit')::integer, 40), 1), 100) AS limit_value,
      ordinal
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_requests) = 'array' THEN p_requests ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS request(value, ordinal)
  ),
  requests AS (
    SELECT DISTINCT ON (req_key)
      req_key,
      column_id,
      null_column,
      offset_value,
      limit_value,
      ordinal
    FROM (
      SELECT
        CASE
          WHEN null_column THEN '__none__'
          WHEN column_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN column_text
          ELSE NULL
        END AS req_key,
        CASE
          WHEN NOT null_column AND column_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN column_text::uuid
          ELSE NULL
        END AS column_id,
        null_column,
        offset_value,
        limit_value,
        ordinal
      FROM raw_requests
    ) normalized
    WHERE req_key IS NOT NULL
    ORDER BY req_key, ordinal
    LIMIT 12
  ),
  scoped AS (
    SELECT
      p.id,
      p.sx_kanban_column_id,
      p.deadline,
      p.created_at
    FROM projects p
    WHERE
      (
        (p_stage_ids IS NOT NULL AND cardinality(p_stage_ids) > 0 AND p.current_stage_id = ANY (p_stage_ids))
        OR (p_statuses IS NOT NULL AND cardinality(p_statuses) > 0 AND p.status::text = ANY (p_statuses))
        OR EXISTS (
          SELECT 1 FROM crm_leads l
          WHERE l.type = 'deal' AND l.project_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM crm_deal_projects dp
          WHERE dp.project_id = p.id
        )
      )
      AND (
        p_company_id IS NULL
        OR p.company_id = p_company_id
        OR (
          p_partner_project_ids IS NOT NULL
          AND cardinality(p_partner_project_ids) > 0
          AND p.id = ANY (p_partner_project_ids)
        )
      )
      AND (
        p_restrict_project_ids IS NULL
        OR p.id = ANY (p_restrict_project_ids)
      )
      AND (
        p_tenant_company_ids IS NULL
        OR cardinality(p_tenant_company_ids) = 0
        OR p.company_id = ANY (p_tenant_company_ids)
        OR p.logistics_company_id = ANY (p_tenant_company_ids)
      )
      AND (
        CASE
          WHEN COALESCE(p_unclassified, false) THEN p.workshop_type_id IS NULL
          WHEN p_workshop_type_id IS NOT NULL THEN p.workshop_type_id = p_workshop_type_id
          ELSE true
        END
      )
      AND (p_created_from IS NULL OR p.created_at >= p_created_from)
      AND (p_created_to IS NULL OR p.created_at <= p_created_to)
      AND (p_production_person_id IS NULL OR p.production_person_id = p_production_person_id)
      AND (p_priority IS NULL OR TRIM(p_priority) = '' OR p.priority::text = p_priority)
      AND (
        v_search IS NULL
        OR p.code ILIKE ('%' || v_search || '%')
        OR p.name ILIKE ('%' || v_search || '%')
        OR COALESCE(p.notes, '') ILIKE ('%' || v_search || '%')
      )
      AND (
        p.sx_kanban_column_id IN (SELECT column_id FROM requests WHERE column_id IS NOT NULL)
        OR (p.sx_kanban_column_id IS NULL AND EXISTS (SELECT 1 FROM requests WHERE null_column))
      )
  ),
  ranked AS (
    SELECT
      s.id,
      COALESCE(s.sx_kanban_column_id::text, '__none__') AS req_key,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(s.sx_kanban_column_id::text, '__none__')
        ORDER BY s.deadline ASC NULLS LAST, s.created_at DESC, s.id
      ) AS row_number,
      COUNT(*) OVER (PARTITION BY COALESCE(s.sx_kanban_column_id::text, '__none__')) AS total
    FROM scoped s
  )
  SELECT jsonb_build_object(
    'pages',
    COALESCE(
      jsonb_object_agg(
        r.req_key,
        jsonb_build_object(
          'ids',
          COALESCE(
            (
              SELECT jsonb_agg(page_row.id ORDER BY page_row.row_number)
              FROM ranked page_row
              WHERE page_row.req_key = r.req_key
                AND page_row.row_number > r.offset_value
                AND page_row.row_number <= r.offset_value + r.limit_value
            ),
            '[]'::jsonb
          ),
          'total',
          COALESCE((SELECT MAX(total) FROM ranked t WHERE t.req_key = r.req_key), 0),
          'nextOffset',
          r.offset_value + COALESCE(
            (
              SELECT COUNT(*)
              FROM ranked page_row
              WHERE page_row.req_key = r.req_key
                AND page_row.row_number > r.offset_value
                AND page_row.row_number <= r.offset_value + r.limit_value
            ),
            0
          ),
          'hasMore',
          r.offset_value + r.limit_value < COALESCE(
            (SELECT MAX(total) FROM ranked t WHERE t.req_key = r.req_key), 0
          )
        )
        ORDER BY r.ordinal
      ),
      '{}'::jsonb
    )
  )
  INTO v_result
  FROM requests r;

  RETURN COALESCE(v_result, jsonb_build_object('pages', '{}'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.sx_kanban_stage_page_ids IS
  'Phân trang nhiều cột Kanban Sản xuất trong 1 lần quét — kiểm tra "đã thắng deal" bằng EXISTS (không cần mảng wonIds), quy mô không phụ thuộc tổng số dự án.';

GRANT EXECUTE ON FUNCTION public.sx_kanban_stage_page_ids TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
