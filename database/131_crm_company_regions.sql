-- 131: Khu vực (chi nhánh) trong công ty — CRM lead/deal + gán user theo khu vực + admin khu vực

CREATE TABLE IF NOT EXISTS company_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_regions_company
  ON company_regions(company_id, is_active, order_index);

COMMENT ON TABLE company_regions IS 'Khu vực / chi nhánh thuộc một công ty (phân quyền CRM theo vùng)';

CREATE TABLE IF NOT EXISTS user_company_regions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id UUID NOT NULL REFERENCES company_regions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_user_company_regions_region ON user_company_regions(region_id);

COMMENT ON TABLE user_company_regions IS 'User thuộc một hoặc nhiều khu vực trong công ty';

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_region_id ON crm_leads(region_id);

COMMENT ON COLUMN crm_leads.region_id IS 'Khu vực CRM (cùng company_id với lead)';

-- ── Backfill: một khu vực «Mặc định» mỗi công ty có lead ──
INSERT INTO company_regions (company_id, name, code, order_index, is_active)
SELECT DISTINCT l.company_id, 'Mặc định', 'DEFAULT', 0, true
FROM crm_leads l
WHERE l.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_regions r WHERE r.company_id = l.company_id
  );

UPDATE crm_leads l
SET region_id = r.id
FROM company_regions r
WHERE l.company_id = r.company_id
  AND COALESCE(r.code, '') = 'DEFAULT'
  AND l.region_id IS NULL;

-- Leads còn null (công ty chưa có region): tạo region tên Mặc định
INSERT INTO company_regions (company_id, name, code, order_index, is_active)
SELECT DISTINCT l.company_id, 'Mặc định', 'DEFAULT', 0, true
FROM crm_leads l
WHERE l.company_id IS NOT NULL
  AND l.region_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_regions r WHERE r.company_id = l.company_id
  );

UPDATE crm_leads l
SET region_id = r.id
FROM company_regions r
WHERE l.company_id = r.company_id
  AND COALESCE(r.code, '') = 'DEFAULT'
  AND l.region_id IS NULL;

-- Gán user (có company_id) vào khu vực mặc định của công ty nếu chưa có dòng nào
INSERT INTO user_company_regions (user_id, region_id)
SELECT u.id, r.id
FROM users u
INNER JOIN LATERAL (
  SELECT id FROM company_regions
  WHERE company_id = u.company_id AND is_active = true
  ORDER BY order_index NULLS LAST, created_at
  LIMIT 1
) r ON true
WHERE u.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_company_regions x WHERE x.user_id = u.id);

-- ── RPC phân trang lead/deal: thêm lọc theo khu vực ──
-- Xóa mọi overload cũ (11 / 12 / 13 tham số) để tránh 2 bản cùng tên → COMMENT/GRANT bị 42725.
DROP FUNCTION IF EXISTS public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[]
);
DROP FUNCTION IF EXISTS public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean
);
DROP FUNCTION IF EXISTS public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer
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
  p_region_ids uuid[] DEFAULT NULL
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
BEGIN
  v_lim := GREATEST(1, LEAST(COALESCE(p_limit, 100), 5000));
  v_off := GREATEST(COALESCE(p_offset, 0), 0);

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
    WHERE l.type = p_type
      AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
      AND (
        p_assigned_to IS NULL
        OR (
          COALESCE(p_assigned_strict, false) = true
          AND l.assigned_to = p_assigned_to
        )
        OR (
          COALESCE(p_assigned_strict, false) = false
          AND (
            l.assigned_to = p_assigned_to
            OR l.lead_owner_id = p_assigned_to
          )
        )
      )
      AND (p_source_id IS NULL OR l.source_id = p_source_id)
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
      AND (p_date_from IS NULL OR TRIM(p_date_from) = '' OR l.created_at >= p_date_from::timestamptz)
      AND (p_date_to IS NULL OR TRIM(p_date_to) = '' OR l.created_at <= (TRIM(p_date_to) || 'T23:59:59.999Z')::timestamptz)
      AND (
        p_search IS NULL OR TRIM(p_search) = ''
        OR l.title ILIKE '%' || TRIM(p_search) || '%'
        OR l.code ILIKE '%' || TRIM(p_search) || '%'
        OR COALESCE(l.phone::text, '') ILIKE '%' || TRIM(p_search) || '%'
      )
      AND (
        p_region_ids IS NULL
        OR array_length(p_region_ids, 1) IS NULL
        OR l.region_id = ANY(p_region_ids)
      )
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE (
      p_phone_filter IS NULL OR TRIM(p_phone_filter) = ''
      OR (TRIM(p_phone_filter) = 'has_phone' AND display_phone IS NOT NULL)
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
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[]
) IS
  'Phân trang GET /api/crm/leads. p_region_ids: chỉ lead có region_id trong mảng; NULL = không lọc theo khu vực.';

GRANT EXECUTE ON FUNCTION public.crm_leads_page_ids(
  text, uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, boolean, uuid[]
) TO service_role;
