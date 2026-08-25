-- ═══════════════════════════════════════════════════════════════════════════════
-- 571 — project_kanban_pages(): lấy trang đầu của NHIỀU cột trong 1 request
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--     Chạy SAU migration 570.
--
-- VÌ SAO CẦN
-- ----------
-- Với `project_kanban_board(mode:='page')` (migration 570), mỗi cột là 1 request. Đo thực
-- tế 1 cột = ~0,85s, mà phần lớn là 4 lượt round-trip tới Supabase (RPC → select → RPC
-- enrich → companies/users), không phải thời gian truy vấn. Nạp N cột kiểu đó thì:
--   • gọi tuần tự  → 0,34s + N × 0,85s   (rất chậm khi nhiều cột)
--   • gọi song song → nhanh hơn nhưng nhân N lần tải cho server
--
-- Hàm này trả về id trang đầu của TẤT CẢ cột trong MỘT lượt, để route chỉ cần 1 lần
-- select + 1 lần enrich cho toàn bộ thẻ → nạp N cột tốn xấp xỉ bằng 1 cột.
--
-- Cùng khuôn với `sx_kanban_stage_page_ids` của Kanban Sản Xuất (migration 561).
--
-- Logic lọc + giải cột nhân bản y hệt migration 570 (4 mức fallback của
-- resolveProjectKanbanStageId phía frontend) — sửa một bên thì phải sửa bên kia.
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ tạo function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.project_kanban_pages(
  p_stage_ids     uuid[],
  p_requests      jsonb         DEFAULT '[]'::jsonb,  -- [{stage_id, offset, limit}, …]
  p_company_ids   uuid[]        DEFAULT NULL,
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_date_from     timestamptz   DEFAULT NULL,
  p_date_to       timestamptz   DEFAULT NULL,
  p_tenant_company_ids uuid[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
BEGIN
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN (
    WITH req AS (
      SELECT (value->>'stage_id')::uuid AS stage_id,
             GREATEST(COALESCE((value->>'offset')::int, 0), 0) AS off,
             LEAST(GREATEST(COALESCE((value->>'limit')::int, 40), 1), 200) AS lim
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_requests) = 'array' THEN p_requests ELSE '[]'::jsonb END
           ) AS r(value)
      WHERE (value->>'stage_id') IS NOT NULL
    ),
    stages AS (
      SELECT s.id, s.slug, ord.i AS ord
      FROM unnest(p_stage_ids) WITH ORDINALITY AS ord(sid, i)
      JOIN workflow_stages s ON s.id = ord.sid
    ),
    first_stage AS (SELECT id FROM stages ORDER BY ord LIMIT 1),
    base AS (
      SELECT p.id, p.status::text AS status, p.created_at, p.current_stage_id
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
          OR p.created_by            = p_person_id::text
          OR EXISTS (SELECT 1 FROM tasks t
                      WHERE t.project_id = p.id AND t.assignee_id = p_person_id)
        )
    ),
    resolved AS (
      SELECT b.id, b.created_at,
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
    ),
    ranked AS (
      SELECT r.id, r.stage_id, r.created_at,
             row_number() OVER (PARTITION BY r.stage_id ORDER BY r.created_at DESC) - 1 AS rn,
             count(*)     OVER (PARTITION BY r.stage_id) AS n_total
      FROM resolved r
      WHERE r.stage_id IN (SELECT stage_id FROM req)
    )
    SELECT COALESCE(jsonb_object_agg(q.stage_id::text, jsonb_build_object(
             'ids', q.ids, 'has_more', q.has_more, 'total', q.n_total
           )), '{}'::jsonb)
    FROM (
      SELECT req.stage_id,
             COALESCE((SELECT jsonb_agg(k.id ORDER BY k.rn)
                         FROM ranked k
                        WHERE k.stage_id = req.stage_id
                          AND k.rn >= req.off AND k.rn < req.off + req.lim), '[]'::jsonb) AS ids,
             COALESCE((SELECT max(k.n_total) FROM ranked k WHERE k.stage_id = req.stage_id), 0) AS n_total,
             COALESCE((SELECT max(k.n_total) FROM ranked k WHERE k.stage_id = req.stage_id), 0)
               > req.off + req.lim AS has_more
      FROM req
    ) q
  );
END;
$$;

COMMENT ON FUNCTION public.project_kanban_pages(uuid[], jsonb, uuid[], uuid, uuid, text, timestamptz, timestamptz, uuid[]) IS
  'Trang đầu của NHIỀU cột Kanban /projects trong 1 lượt, để route chỉ select+enrich 1 lần. '
  'Xem migration 571; logic lọc/giải cột phải khớp migration 570.';

REVOKE ALL ON FUNCTION public.project_kanban_pages(uuid[], jsonb, uuid[], uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_kanban_pages(uuid[], jsonb, uuid[], uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.project_kanban_pages(uuid[], jsonb, uuid[], uuid, uuid, text, timestamptz, timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.project_kanban_pages(uuid[], jsonb, uuid[], uuid, uuid, text, timestamptz, timestamptz, uuid[]) TO service_role;
