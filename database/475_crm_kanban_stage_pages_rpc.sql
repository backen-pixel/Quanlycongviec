-- 475: Phân trang nhiều cột CRM Kanban trong một lần quét database.
-- Trả id theo từng stage; backend hydrate toàn bộ id bằng một truy vấn chung.

CREATE OR REPLACE FUNCTION public.crm_kanban_stage_page_ids(
  p_type text,
  p_requests jsonb DEFAULT '[]'::jsonb,
  p_assigned_to uuid DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_phone_filter text DEFAULT NULL,
  p_assigned_strict boolean DEFAULT false,
  p_region_ids uuid[] DEFAULT NULL,
  p_assignee_name text DEFAULT NULL,
  p_region_unassigned boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_assignee_name text := NULLIF(TRIM(COALESCE(p_assignee_name, '')), '');
  v_result jsonb;
BEGIN
  WITH raw_requests AS (
    SELECT
      value->>'stage_id' AS stage_text,
      GREATEST(COALESCE((value->>'offset')::integer, 0), 0) AS offset_value,
      LEAST(GREATEST(COALESCE((value->>'limit')::integer, 20), 1), 40) AS limit_value,
      ordinal
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_requests) = 'array' THEN p_requests
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS request(value, ordinal)
  ),
  requests AS (
    SELECT DISTINCT ON (stage_id)
      stage_id,
      offset_value,
      limit_value,
      ordinal
    FROM (
      SELECT
        CASE
          WHEN stage_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN stage_text::uuid
          ELSE NULL
        END AS stage_id,
        offset_value,
        limit_value,
        ordinal
      FROM raw_requests
    ) normalized
    WHERE stage_id IS NOT NULL
    ORDER BY stage_id, ordinal
    LIMIT 12
  ),
  base AS (
    SELECT
      l.id,
      l.stage_id,
      l.created_at,
      CASE
        WHEN NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL THEN c.phone::text
        WHEN NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL THEN l.phone::text
        ELSE NULL
      END AS display_phone
    FROM public.crm_leads l
    LEFT JOIN public.customers c ON c.id = l.customer_id
    LEFT JOIN public.users ua ON ua.id = l.assigned_to
    LEFT JOIN public.users uo ON uo.id = l.lead_owner_id
    LEFT JOIN public.crm_sources src ON src.id = l.source_id
    WHERE l.type = p_type
      AND l.parent_lead_id IS NULL
      AND l.stage_id IN (SELECT stage_id FROM requests)
      AND (
        p_assigned_to IS NULL
        OR (
          COALESCE(p_assigned_strict, false)
          AND (
            l.assigned_to = p_assigned_to
            OR EXISTS (
              SELECT 1
              FROM public.lead_members lm
              WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
            )
          )
        )
        OR (
          NOT COALESCE(p_assigned_strict, false)
          AND (
            l.assigned_to = p_assigned_to
            OR l.lead_owner_id = p_assigned_to
            OR EXISTS (
              SELECT 1
              FROM public.lead_members lm
              WHERE lm.lead_id = l.id AND lm.user_id = p_assigned_to
            )
          )
        )
      )
      AND (p_source_id IS NULL OR l.source_id = p_source_id)
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
      AND (p_date_from IS NULL OR TRIM(p_date_from) = '' OR l.created_at >= p_date_from::timestamptz)
      AND (
        p_date_to IS NULL
        OR TRIM(p_date_to) = ''
        OR l.created_at <= (TRIM(p_date_to) || 'T23:59:59.999Z')::timestamptz
      )
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
          WHEN COALESCE(p_region_unassigned, false) THEN
            l.region_id IS NULL
          WHEN p_region_ids IS NULL OR array_length(p_region_ids, 1) IS NULL THEN
            true
          ELSE
            l.region_id = ANY(p_region_ids)
            OR (
              p_assigned_to IS NOT NULL
              AND (
                l.assigned_to = p_assigned_to
                OR (
                  NOT COALESCE(p_assigned_strict, false)
                  AND l.lead_owner_id = p_assigned_to
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.lead_members lm
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
      p_phone_filter IS NULL
      OR TRIM(p_phone_filter) = ''
      OR (
        TRIM(p_phone_filter) = 'has_phone'
        AND (
          display_phone IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM public.zalo_contacts zc WHERE zc.lead_id = base.id
          )
        )
      )
      OR (TRIM(p_phone_filter) = 'no_phone' AND display_phone IS NULL)
    )
  ),
  ranked AS (
    SELECT
      id,
      stage_id,
      ROW_NUMBER() OVER (
        PARTITION BY stage_id
        ORDER BY (display_phone IS NOT NULL) DESC, created_at DESC, id
      ) AS row_number,
      COUNT(*) OVER (PARTITION BY stage_id) AS total
    FROM filtered
  )
  SELECT jsonb_build_object(
    'pages',
    COALESCE(
      jsonb_object_agg(
        r.stage_id::text,
        jsonb_build_object(
          'ids',
          COALESCE(
            (
              SELECT jsonb_agg(page_row.id ORDER BY page_row.row_number)
              FROM ranked page_row
              WHERE page_row.stage_id = r.stage_id
                AND page_row.row_number > r.offset_value
                AND page_row.row_number <= r.offset_value + r.limit_value
            ),
            '[]'::jsonb
          ),
          'total',
          COALESCE(
            (SELECT MAX(total) FROM ranked total_row WHERE total_row.stage_id = r.stage_id),
            0
          ),
          'nextOffset',
          r.offset_value + COALESCE(
            (
              SELECT COUNT(*)
              FROM ranked page_row
              WHERE page_row.stage_id = r.stage_id
                AND page_row.row_number > r.offset_value
                AND page_row.row_number <= r.offset_value + r.limit_value
            ),
            0
          ),
          'hasMore',
          r.offset_value + r.limit_value < COALESCE(
            (SELECT MAX(total) FROM ranked total_row WHERE total_row.stage_id = r.stage_id),
            0
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

GRANT EXECUTE ON FUNCTION public.crm_kanban_stage_page_ids(
  text, jsonb, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], text, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.crm_kanban_stage_page_ids(
  text, jsonb, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], text, boolean
) IS 'Phân trang id của nhiều cột CRM Kanban trong một lần quét dữ liệu';
