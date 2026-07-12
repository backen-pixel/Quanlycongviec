-- Sync with database/326_crm_leads_stage_counts_rpc.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_leads'
  ) THEN
    RAISE EXCEPTION
      'Bảng public.crm_leads chưa tồn tại — sai Supabase project hoặc chưa chạy database/19_crm_sales.sql.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[]
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
  p_pipeline_stage_ids uuid[] DEFAULT NULL
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
BEGIN
  WITH base AS (
    SELECT
      l.id,
      l.stage_id,
      CASE
        WHEN NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL THEN c.phone::text
        WHEN NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL THEN l.phone::text
        ELSE NULL
      END AS display_phone
    FROM crm_leads l
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE l.type = p_type
      AND l.parent_lead_id IS NULL
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
      AND (
        p_pipeline_stage_ids IS NULL
        OR array_length(p_pipeline_stage_ids, 1) IS NULL
        OR l.stage_id = ANY(p_pipeline_stage_ids)
        OR l.stage_id IS NULL
      )
  ),
  filtered AS (
    SELECT id, stage_id
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
  grouped AS (
    SELECT stage_id, COUNT(*)::bigint AS cnt
    FROM filtered
    GROUP BY stage_id
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM filtered),
    COALESCE(
      (
        SELECT jsonb_object_agg(
          COALESCE(stage_id::text, '__none__'),
          cnt
        )
        FROM grouped
      ),
      '{}'::jsonb
    )
  INTO v_total, v_counts;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'counts', COALESCE(v_counts, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[]
) TO service_role;

GRANT EXECUTE ON FUNCTION public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[]
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.crm_leads_stage_counts(
  text, uuid, uuid, uuid, text, text, text, text, boolean, uuid[], uuid[]
) TO anon;

NOTIFY pgrst, 'reload schema';
