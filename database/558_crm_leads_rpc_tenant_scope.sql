-- 558: Thêm p_company_ids (mảng) vào crm_leads_page_ids / crm_leads_stage_counts để chặn rò rỉ
-- dữ liệu xuyên tenant.
--
-- Bối cảnh: resolveCrmLeadsMergedQuery() (backend/src/routes/crm/shared/helpersBundle.js) chỉ ép
-- p_company_id (1 công ty) cho admin công ty / nhân viên thường. Với admin HỆ THỐNG (company_id
-- NULL) đang xem "Tất cả công ty", KHÔNG có điều kiện lọc nào được áp — trong khi danh sách công
-- ty hiển thị ở dropdown (/api/companies) LẠI lọc theo tenant_id. Hệ quả: nếu 2 tenant (2 khách
-- hàng SaaS khác nhau) tình cờ có công ty trùng tên, admin hệ thống của tenant A có thể vô tình
-- đếm/tải cả lead-deal của tenant B (dù Kanban "không thấy" vì thiếu stage nên bị ẩn, số liệu
-- tổng/đếm ở server vẫn lẫn dữ liệu tenant khác).
--
-- Fix: thêm tham số MẢNG p_company_ids (khác p_company_id — vẫn giữ để tương thích ngược). Khi
-- admin hệ thống xem "Tất cả công ty", backend sẽ truyền đúng danh sách company_id thuộc tenant
-- của họ (getTenantCompanyIds) vào p_company_ids để giới hạn kết quả về đúng tenant.
--
-- ⚠️ Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.

DROP FUNCTION IF EXISTS public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[], text, boolean
);

CREATE OR REPLACE FUNCTION public.crm_leads_page_ids(
  p_type text,
  p_stage_id uuid DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_phone_filter text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_assigned_strict boolean DEFAULT false,
  p_region_ids uuid[] DEFAULT NULL,
  p_assignee_name text DEFAULT NULL,
  p_region_unassigned boolean DEFAULT false,
  p_company_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_ids uuid[];
  v_lim int;
  v_off int;
  v_search text;
  v_assignee_name text;
BEGIN
  v_lim := GREATEST(1, LEAST(COALESCE(p_limit, 100), 5000));
  v_off := GREATEST(COALESCE(p_offset, 0), 0);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_assignee_name := NULLIF(TRIM(COALESCE(p_assignee_name, '')), '');

  WITH base AS (
    SELECT
      l.id,
      l.created_at,
      CASE
        WHEN NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL THEN c.phone::text
        WHEN NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL THEN l.phone::text
        ELSE NULL
      END AS display_phone
    FROM crm_leads l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN users ua ON ua.id = l.assigned_to
    LEFT JOIN users uo ON uo.id = l.lead_owner_id
    LEFT JOIN crm_sources src ON src.id = l.source_id
    WHERE l.type = p_type
      AND l.parent_lead_id IS NULL
      AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
      AND (
        p_assigned_to IS NULL
        OR (
          COALESCE(p_assigned_strict, false) = true
          AND (
            l.assigned_to = p_assigned_to
            OR EXISTS (
              SELECT 1 FROM lead_members lm
              WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
            )
          )
        )
        OR (
          COALESCE(p_assigned_strict, false) = false
          AND (
            l.assigned_to = p_assigned_to
            OR l.lead_owner_id = p_assigned_to
            OR EXISTS (
              SELECT 1 FROM lead_members lm
              WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
            )
          )
        )
      )
      AND (p_source_id IS NULL OR l.source_id = p_source_id)
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
      AND (p_company_ids IS NULL OR l.company_id = ANY(p_company_ids))
      AND (p_date_from IS NULL OR TRIM(p_date_from) = '' OR l.created_at >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR TRIM(p_date_to) = '' OR l.created_at <= (TRIM(p_date_to) || 'T23:59:59.999Z')::timestamptz)
      AND (
        v_search IS NULL
        OR l.title ILIKE '%' || v_search || '%'
        OR l.code ILIKE '%' || v_search || '%'
        OR COALESCE(l.phone::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(l.description::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(l.install_address::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.phone::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.full_name::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.email::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.address::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.company::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(ua.full_name::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(uo.full_name::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(src.name::text, '') ILIKE '%' || v_search || '%'
      )
      AND (
        v_assignee_name IS NULL
        OR COALESCE(ua.full_name::text, '') ILIKE '%' || v_assignee_name || '%'
        OR COALESCE(uo.full_name::text, '') ILIKE '%' || v_assignee_name || '%'
      )
      AND (
        CASE
          WHEN COALESCE(p_region_unassigned, false) = true THEN
            (l.region_id IS NULL OR TRIM(COALESCE(l.region_id::text, '')) = '')
          WHEN p_region_ids IS NULL OR array_length(p_region_ids, 1) IS NULL THEN
            true
          ELSE
            l.region_id = ANY(p_region_ids)
            OR (
              -- Đã giao / chủ sở hữu / thành viên: luôn hiện kể cả region lệch hoặc NULL
              p_assigned_to IS NOT NULL
              AND (
                l.assigned_to = p_assigned_to
                OR (
                  COALESCE(p_assigned_strict, false) = false
                  AND l.lead_owner_id = p_assigned_to
                )
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
                )
              )
            )
        END
      )
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE (
      p_phone_filter IS NULL OR TRIM(p_phone_filter) = ''
      OR (
        TRIM(p_phone_filter) = 'has_phone'
        AND (
          display_phone IS NOT NULL
          OR EXISTS (SELECT 1 FROM zalo_contacts zc WHERE zc.lead_id = base.id)
        )
      )
      OR (TRIM(p_phone_filter) = 'no_phone' AND display_phone IS NULL)
    )
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS c FROM filtered
  ),
  ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        ORDER BY (display_phone IS NOT NULL) DESC, created_at DESC
      ) AS rn
    FROM filtered
  )
  SELECT
    (SELECT c FROM counted),
    COALESCE(
      ARRAY(
        SELECT id FROM ranked
        WHERE rn > v_off AND rn <= v_off + v_lim
        ORDER BY rn
      ),
      ARRAY[]::uuid[]
    )
  INTO v_total, v_ids;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'ids', COALESCE(to_jsonb(v_ids), '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[], text, boolean, uuid[]
) IS
  'Phân trang GET /api/crm/leads. p_company_ids giới hạn theo tenant khi admin hệ thống xem "Tất cả công ty".';

GRANT EXECUTE ON FUNCTION public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[], text, boolean, uuid[]
) TO service_role;

GRANT EXECUTE ON FUNCTION public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[], text, boolean, uuid[]
) TO authenticated;

DROP FUNCTION IF EXISTS public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[], text, boolean
);

CREATE OR REPLACE FUNCTION public.crm_leads_stage_counts(
  p_type text,
  p_assigned_to uuid DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_phone_filter text DEFAULT NULL,
  p_assigned_strict boolean DEFAULT false,
  p_region_ids uuid[] DEFAULT NULL,
  p_pipeline_stage_ids uuid[] DEFAULT NULL,
  p_assignee_name text DEFAULT NULL,
  p_region_unassigned boolean DEFAULT false,
  p_company_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_counts jsonb;
  v_values jsonb;
  v_weighted jsonb;
  v_search text;
  v_assignee_name text;
BEGIN
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_assignee_name := NULLIF(TRIM(COALESCE(p_assignee_name, '')), '');

  WITH base AS (
    SELECT
      l.id,
      l.stage_id,
      COALESCE(l.estimated_value, 0)::float8 AS estimated_value,
      CASE
        WHEN l.probability IS NOT NULL AND l.probability::text <> ''
          THEN LEAST(100::float8, GREATEST(0::float8, l.probability::float8))
        ELSE 50::float8
      END AS probability_pct,
      CASE
        WHEN NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL THEN c.phone::text
        WHEN NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL THEN l.phone::text
        ELSE NULL
      END AS display_phone
    FROM crm_leads l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN users ua ON ua.id = l.assigned_to
    LEFT JOIN users uo ON uo.id = l.lead_owner_id
    LEFT JOIN crm_sources src ON src.id = l.source_id
    WHERE l.type = p_type
      AND l.parent_lead_id IS NULL
      AND (
        p_assigned_to IS NULL
        OR (
          COALESCE(p_assigned_strict, false) = true
          AND (
            l.assigned_to = p_assigned_to
            OR EXISTS (
              SELECT 1 FROM lead_members lm
              WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
            )
          )
        )
        OR (
          COALESCE(p_assigned_strict, false) = false
          AND (
            l.assigned_to = p_assigned_to
            OR l.lead_owner_id = p_assigned_to
            OR EXISTS (
              SELECT 1 FROM lead_members lm
              WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
            )
          )
        )
      )
      AND (p_source_id IS NULL OR l.source_id = p_source_id)
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
      AND (p_company_ids IS NULL OR l.company_id = ANY(p_company_ids))
      AND (p_date_from IS NULL OR TRIM(p_date_from) = '' OR l.created_at >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR TRIM(p_date_to) = '' OR l.created_at <= (TRIM(p_date_to) || 'T23:59:59.999Z')::timestamptz)
      AND (
        v_search IS NULL
        OR l.title ILIKE '%' || v_search || '%'
        OR l.code ILIKE '%' || v_search || '%'
        OR COALESCE(l.phone::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(l.description::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(l.install_address::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.phone::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.full_name::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.email::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.address::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(c.company::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(ua.full_name::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(uo.full_name::text, '') ILIKE '%' || v_search || '%'
        OR COALESCE(src.name::text, '') ILIKE '%' || v_search || '%'
      )
      AND (
        v_assignee_name IS NULL
        OR COALESCE(ua.full_name::text, '') ILIKE '%' || v_assignee_name || '%'
        OR COALESCE(uo.full_name::text, '') ILIKE '%' || v_assignee_name || '%'
      )
      AND (
        CASE
          WHEN COALESCE(p_region_unassigned, false) = true THEN
            (l.region_id IS NULL OR TRIM(COALESCE(l.region_id::text, '')) = '')
          WHEN p_region_ids IS NULL OR array_length(p_region_ids, 1) IS NULL THEN
            true
          ELSE
            l.region_id = ANY(p_region_ids)
            OR (
              p_assigned_to IS NOT NULL
              AND (
                l.assigned_to = p_assigned_to
                OR (
                  COALESCE(p_assigned_strict, false) = false
                  AND l.lead_owner_id = p_assigned_to
                )
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
                )
              )
            )
        END
      )
      AND (
        p_pipeline_stage_ids IS NULL
        OR array_length(p_pipeline_stage_ids, 1) IS NULL
        OR l.stage_id = ANY(p_pipeline_stage_ids)
        OR l.stage_id IS NULL
      )
  ),
  filtered AS (
    SELECT id, stage_id, estimated_value, probability_pct
    FROM base
    WHERE (
      p_phone_filter IS NULL OR TRIM(p_phone_filter) = ''
      OR (
        TRIM(p_phone_filter) = 'has_phone'
        AND (
          display_phone IS NOT NULL
          OR EXISTS (SELECT 1 FROM zalo_contacts zc WHERE zc.lead_id = base.id)
        )
      )
      OR (TRIM(p_phone_filter) = 'no_phone' AND display_phone IS NULL)
    )
  ),
  stage_agg AS (
    SELECT
      stage_id,
      COUNT(*)::bigint AS cnt,
      COALESCE(SUM(estimated_value), 0)::float8 AS val_sum,
      COALESCE(SUM(estimated_value * probability_pct / 100.0), 0)::float8 AS weighted_sum
    FROM filtered
    GROUP BY stage_id
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM filtered),
    COALESCE(
      (
        SELECT jsonb_object_agg(COALESCE(stage_id::text, '__none__'), cnt)
        FROM stage_agg
      ),
      '{}'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_object_agg(COALESCE(stage_id::text, '__none__'), val_sum)
        FROM stage_agg
      ),
      '{}'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_object_agg(COALESCE(stage_id::text, '__none__'), weighted_sum)
        FROM stage_agg
      ),
      '{}'::jsonb
    )
  INTO v_total, v_counts, v_values, v_weighted;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'counts', COALESCE(v_counts, '{}'::jsonb),
    'values', COALESCE(v_values, '{}'::jsonb),
    'weighted_values', COALESCE(v_weighted, '{}'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[], text, boolean, uuid[]
) IS
  'Đếm lead/deal theo cột. p_company_ids giới hạn theo tenant khi admin hệ thống xem "Tất cả công ty".';

GRANT EXECUTE ON FUNCTION public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[], text, boolean, uuid[]
) TO service_role;

GRANT EXECUTE ON FUNCTION public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[], text, boolean, uuid[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';
