-- Ẩn deal/lead con (parent_lead_id != NULL) khỏi danh sách Pipeline & Leads/Deals.
-- Deal con vẫn tồn tại để chứa nhiệm vụ theo đơn (Đơn 1,2,...), nhưng không được hiển thị như 1 card riêng.

-- Variant mới (có p_assigned_strict)
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
  p_assigned_strict boolean DEFAULT false
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
      AND l.parent_lead_id IS NULL
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

-- Fallback (DB cũ, không có p_assigned_strict) vẫn sẽ bị override bởi hàm trên khi schema có đủ tham số.
-- Nếu DB bạn đang dùng variant 11 params, hãy chạy database/51_crm_leads_page_ids_hotfix.sql trước, rồi chạy file này.

