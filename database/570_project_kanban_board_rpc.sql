-- ═══════════════════════════════════════════════════════════════════════════════
-- 570 — project_kanban_board(): đếm + phân trang từng cột cho Kanban trang /projects
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- VẤN ĐỀ
-- ------
-- Trang /projects gọi `GET /api/projects?limit=500` rồi làm MỌI THỨ ở client: lọc, nhóm
-- theo cột Kanban, đếm badge, tính KPI. Hệ quả đo được:
--
--     500 dự án →  1,3 s  ·  2,2 MB JSON
--   2.000 dự án →  ~3 s   ·  8,9 MB      (ngoại suy: 0,75s cố định + 1,1ms/dự án)
--   8.000 dự án →  ~9,6 s ·  ~35 MB
--
-- Tệ hơn: `limit: 500` là số CỨNG, không có phân trang. Hiện tại tổng 569 dự án nên
-- trang đang ÂM THẦM bỏ 69 dự án; ở mức 8.000 thì chỉ hiện 500 (sai 94%) và badge đếm
-- theo cột cũng sai theo.
--
-- CÁCH LÀM
-- --------
-- Theo đúng khuôn Kanban Sản Xuất đã dùng (migration 561): RPC chỉ trả về SỐ ĐẾM hoặc
-- DANH SÁCH ID của một trang, còn phần dựng payload đầy đủ vẫn đi qua code hiện có
-- (select + enrich) — nên không phải viết lại logic đóng gói, rủi ro lệch dữ liệu thấp.
--
--   mode='summary' → { total, counts{stage_id: n}, working, done, overdue, no_deadline, value_sum }
--   mode='page'    → { ids: [...], has_more }   cho MỘT cột
--
-- Nhờ vậy thời gian tải KHÔNG còn phụ thuộc tổng số dự án: mỗi lần chỉ lấy số đếm +
-- ~40 thẻ của cột đang xem.
--
-- NHÂN BẢN ĐÚNG LOGIC CỘT
-- -----------------------
-- Cột KHÔNG chỉ là `current_stage_id`. `resolveProjectKanbanStageId()` phía frontend
-- (lib/projectDeliveryStages.js) có 4 mức fallback, phải khớp từng mức:
--   1. `current_stage_id` nếu nằm trong tập cột đang hiện
--   2. nếu không, khớp theo SLUG của stage mà `current_stage_id` trỏ tới
--   3. nếu không, map từ `status` qua STATUS_TO_SLUG
--   4. nếu không, cột ĐẦU TIÊN
-- Sai một mức là thẻ nhảy sang cột khác so với hiện tại.
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ tạo function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.project_kanban_board(
  p_stage_ids     uuid[],                      -- cột đang hiện, ĐÚNG THỨ TỰ order_index
  p_company_ids   uuid[]        DEFAULT NULL,   -- NULL = không lọc (đã gộp lọc Khối/Công ty)
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_date_from     timestamptz   DEFAULT NULL,
  p_date_to       timestamptz   DEFAULT NULL,
  p_mode          text          DEFAULT 'summary',  -- 'summary' | 'page'
  p_stage_id      uuid          DEFAULT NULL,       -- bắt buộc khi mode='page'
  p_offset        integer       DEFAULT 0,
  p_limit         integer       DEFAULT 40,
  p_tenant_company_ids uuid[]   DEFAULT NULL        -- phạm vi tenant (NULL = không giới hạn)
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_result jsonb;
BEGIN
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN (
    WITH stages AS (
      SELECT s.id, s.slug, ord.i AS ord
      FROM unnest(p_stage_ids) WITH ORDINALITY AS ord(sid, i)
      JOIN workflow_stages s ON s.id = ord.sid
    ),
    first_stage AS (
      SELECT id FROM stages ORDER BY ord LIMIT 1
    ),
    base AS (
      SELECT p.id, p.status::text AS status, p.created_at, p.deadline, p.design_deadline,
             p.estimated_value, p.current_stage_id
      FROM projects p
      WHERE (p_company_ids IS NULL OR p.company_id = ANY (p_company_ids))
        AND (
          p_tenant_company_ids IS NULL
          OR cardinality(p_tenant_company_ids) = 0
          OR p.company_id = ANY (p_tenant_company_ids)
          OR p.logistics_company_id = ANY (p_tenant_company_ids)
        )
        AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
        AND (p_date_from IS NULL OR p.created_at >= p_date_from)
        AND (p_date_to   IS NULL OR p.created_at <= p_date_to)
        AND (
          v_search IS NULL
          OR p.code ILIKE ('%' || v_search || '%')
          OR p.name ILIKE ('%' || v_search || '%')
        )
        AND (
          p_person_id IS NULL
          -- 13 cột người phụ trách mà frontend đang kiểm tra…
          OR p.sales_person_id       = p_person_id
          OR p.designer_id           = p_person_id
          OR p.project_manager_id    = p_person_id
          OR p.consulting_person_id  = p_person_id
          OR p.design_person_id      = p_person_id
          OR p.quotation_person_id   = p_person_id
          OR p.contract_person_id    = p_person_id
          OR p.production_person_id  = p_person_id
          OR p.shipping_person_id    = p_person_id
          OR p.installation_person_id= p_person_id
          OR p.care_person_id        = p_person_id
          OR p.supervisor_id         = p_person_id
          OR p.created_by            = p_person_id::text  -- created_by là text, không FK
          -- …cộng thêm "có nhiệm vụ được giao" (frontend dùng taskAssigneeMap)
          OR EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.project_id = p.id AND t.assignee_id = p_person_id
          )
        )
    ),
    -- Khớp từng mức fallback của resolveProjectKanbanStageId()
    resolved AS (
      SELECT b.*,
             COALESCE(
               (SELECT s.id FROM stages s WHERE s.id = b.current_stage_id),
               (SELECT s.id FROM stages s
                  JOIN workflow_stages cs ON cs.id = b.current_stage_id AND cs.slug = s.slug
                 ORDER BY s.ord LIMIT 1),
               (SELECT s.id FROM stages s
                 WHERE s.slug = CASE lower(COALESCE(b.status, ''))
                                  WHEN 'consulting'      THEN 'order'
                                  WHEN 'designing'       THEN 'design'
                                  WHEN 'quoting'         THEN 'design'
                                  WHEN 'contract_signed' THEN 'order'
                                  WHEN 'producing'       THEN 'production'
                                  WHEN 'shipping'        THEN 'delivery'
                                  WHEN 'installing'      THEN 'installation'
                                  WHEN 'completed'       THEN 'acceptance'
                                  WHEN 'warranty'        THEN 'warranty'
                                  WHEN 'on_hold'         THEN 'order'
                                  WHEN 'new'             THEN 'order'
                                  ELSE 'order'
                                END
                 ORDER BY s.ord LIMIT 1),
               (SELECT id FROM first_stage)
             ) AS stage_id
      FROM base b
    )
    SELECT CASE
      WHEN p_mode = 'page' THEN
        (SELECT jsonb_build_object(
                  'ids', COALESCE(jsonb_agg(x.id ORDER BY x.created_at DESC), '[]'::jsonb),
                  'has_more', (SELECT count(*) FROM resolved r WHERE r.stage_id = p_stage_id)
                              > (p_offset + p_limit)
                )
           FROM (
             SELECT r.id, r.created_at FROM resolved r
             WHERE r.stage_id = p_stage_id
             ORDER BY r.created_at DESC
             OFFSET GREATEST(p_offset, 0) LIMIT LEAST(GREATEST(p_limit, 1), 200)
           ) x)
      ELSE
        -- Số đếm theo cột + KPI, khớp đúng useMemo `kpi` phía frontend
        (SELECT jsonb_build_object(
           'total',       count(*),
           'counts',      COALESCE((SELECT jsonb_object_agg(g.stage_id::text, g.n)
                                      FROM (SELECT stage_id, count(*) AS n
                                              FROM resolved GROUP BY stage_id) g), '{}'::jsonb),
           'working',     count(*) FILTER (WHERE status IS NOT NULL AND status <> ''
                                             AND status NOT IN ('completed', 'warranty', 'on_hold')),
           'done',        count(*) FILTER (WHERE status IN ('completed', 'warranty')),
           'overdue',     count(*) FILTER (WHERE COALESCE(deadline, design_deadline) IS NOT NULL
                                             AND COALESCE(deadline, design_deadline) < now()
                                             AND status <> 'completed'),
           'no_deadline', count(*) FILTER (WHERE COALESCE(deadline, design_deadline) IS NULL),
           'value_sum',   COALESCE(sum(estimated_value), 0)
         ) FROM resolved)
    END
  );
END;
$$;

COMMENT ON FUNCTION public.project_kanban_board(uuid[], uuid[], uuid, uuid, text, timestamptz, timestamptz, text, uuid, integer, integer, uuid[]) IS
  'Đếm theo cột + phân trang từng cột cho Kanban /projects. Thay cho việc tải hết 500 dự án '
  'rồi lọc/nhóm ở client (1,3s/2,2MB ở 500 dự án; ~9,6s/35MB ở 8.000). Xem migration 570.';

-- SECURITY DEFINER: Postgres mặc định cấp EXECUTE cho PUBLIC → thu hồi trước.
REVOKE ALL ON FUNCTION public.project_kanban_board(uuid[], uuid[], uuid, uuid, text, timestamptz, timestamptz, text, uuid, integer, integer, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_kanban_board(uuid[], uuid[], uuid, uuid, text, timestamptz, timestamptz, text, uuid, integer, integer, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.project_kanban_board(uuid[], uuid[], uuid, uuid, text, timestamptz, timestamptz, text, uuid, integer, integer, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.project_kanban_board(uuid[], uuid[], uuid, uuid, text, timestamptz, timestamptz, text, uuid, integer, integer, uuid[]) TO service_role;

-- ── Kiểm tra sau khi chạy ─────────────────────────────────────────────────────
-- Tổng của các cột phải bằng tổng số dự án đang hiện:
--   WITH st AS (
--     SELECT array_agg(id ORDER BY order_index) AS ids FROM workflow_stages
--     WHERE is_active AND company_id IS NULL AND slug NOT LIKE 'sx-sample-%'
--   )
--   SELECT public.project_kanban_board(st.ids) FROM st;
