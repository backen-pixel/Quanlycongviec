-- 471: Gom tổng Lead/Deal, bucket SĐT và counts theo stage trong một RPC.
-- Thay tối đa 7 request stage-counts khi CRM Dashboard đổi bộ lọc.

CREATE OR REPLACE FUNCTION public.crm_filter_summary(
  p_company_id uuid DEFAULT NULL,
  p_lead_assigned_to uuid DEFAULT NULL,
  p_deal_assigned_to uuid DEFAULT NULL,
  p_lead_assigned_strict boolean DEFAULT false,
  p_deal_assigned_strict boolean DEFAULT false,
  p_source_id uuid DEFAULT NULL,
  p_date_from text DEFAULT NULL,
  p_date_to text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_assignee_name text DEFAULT NULL,
  p_region_ids uuid[] DEFAULT NULL,
  p_region_unassigned boolean DEFAULT false,
  p_lead_stage_ids uuid[] DEFAULT NULL,
  p_deal_stage_ids uuid[] DEFAULT NULL,
  p_phone_filter text DEFAULT NULL,
  p_lead_type_id uuid DEFAULT NULL,
  p_referrer_name text DEFAULT NULL,
  p_customer_company text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_search text;
  v_assignee_name text;
  v_referrer_name text;
  v_customer_company text;
  v_result jsonb;
BEGIN
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_assignee_name := NULLIF(TRIM(COALESCE(p_assignee_name, '')), '');
  v_referrer_name := NULLIF(TRIM(COALESCE(p_referrer_name, '')), '');
  v_customer_company := NULLIF(TRIM(COALESCE(p_customer_company, '')), '');

  WITH base AS (
    SELECT
      l.id,
      l.type,
      l.stage_id,
      -- Khớp crm_leads_stage_counts / migration 470:
      -- has_phone = có SĐT hiển thị HOẶC có Zalo; no_phone = không có SĐT hiển thị
      -- (Zalo-only vẫn vào cả hai bucket — không phân hoạch sạch).
      (
        NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL
      ) AS has_display_phone,
      (
        NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM zalo_contacts zc
          WHERE zc.lead_id = l.id
        )
      ) AS has_phone
    FROM crm_leads l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN users ua ON ua.id = l.assigned_to
    LEFT JOIN users uo ON uo.id = l.lead_owner_id
    LEFT JOIN crm_sources src ON src.id = l.source_id
    WHERE l.type IN ('lead', 'deal')
      AND l.parent_lead_id IS NULL
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
      AND (p_source_id IS NULL OR l.source_id = p_source_id)
      AND (p_lead_type_id IS NULL OR l.lead_type_id = p_lead_type_id)
      AND (p_date_from IS NULL OR TRIM(p_date_from) = '' OR l.created_at >= p_date_from::timestamptz)
      AND (
        p_date_to IS NULL
        OR TRIM(p_date_to) = ''
        OR l.created_at <= (TRIM(p_date_to) || 'T23:59:59.999Z')::timestamptz
      )
      AND (
        (
          l.type = 'lead'
          AND (
            p_lead_assigned_to IS NULL
            OR (
              COALESCE(p_lead_assigned_strict, false) = true
              AND (
                l.assigned_to = p_lead_assigned_to
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_lead_assigned_to
                )
              )
            )
            OR (
              COALESCE(p_lead_assigned_strict, false) = false
              AND (
                l.assigned_to = p_lead_assigned_to
                OR l.lead_owner_id = p_lead_assigned_to
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_lead_assigned_to
                )
              )
            )
          )
        )
        OR (
          l.type = 'deal'
          AND (
            p_deal_assigned_to IS NULL
            OR (
              COALESCE(p_deal_assigned_strict, false) = true
              AND (
                l.assigned_to = p_deal_assigned_to
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_deal_assigned_to
                )
              )
            )
            OR (
              COALESCE(p_deal_assigned_strict, false) = false
              AND (
                l.assigned_to = p_deal_assigned_to
                OR l.lead_owner_id = p_deal_assigned_to
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_deal_assigned_to
                )
              )
            )
          )
        )
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
        v_referrer_name IS NULL
        OR (
          v_referrer_name = '__none__'
          AND NULLIF(TRIM(COALESCE(l.referrer_name::text, '')), '') IS NULL
        )
        OR (
          v_referrer_name <> '__none__'
          AND TRIM(COALESCE(l.referrer_name::text, '')) = v_referrer_name
        )
      )
      AND (
        v_customer_company IS NULL
        OR (
          v_customer_company = '__none__'
          AND NULLIF(TRIM(COALESCE(c.company::text, '')), '') IS NULL
        )
        OR (
          v_customer_company <> '__none__'
          AND TRIM(COALESCE(c.company::text, '')) = v_customer_company
        )
      )
      AND (
        CASE
          WHEN COALESCE(p_region_unassigned, false) = true THEN
            l.region_id IS NULL
          WHEN p_region_ids IS NULL OR array_length(p_region_ids, 1) IS NULL THEN
            true
          ELSE
            l.region_id = ANY(p_region_ids)
            OR (
              l.type = 'lead'
              AND p_lead_assigned_to IS NOT NULL
              AND (
                l.assigned_to = p_lead_assigned_to
                OR (
                  COALESCE(p_lead_assigned_strict, false) = false
                  AND l.lead_owner_id = p_lead_assigned_to
                )
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_lead_assigned_to
                )
              )
            )
            OR (
              l.type = 'deal'
              AND p_deal_assigned_to IS NOT NULL
              AND (
                l.assigned_to = p_deal_assigned_to
                OR (
                  COALESCE(p_deal_assigned_strict, false) = false
                  AND l.lead_owner_id = p_deal_assigned_to
                )
                OR EXISTS (
                  SELECT 1 FROM lead_members lm
                  WHERE lm.lead_id = l.id AND lm.user_id = p_deal_assigned_to
                )
              )
            )
        END
      )
      AND (
        (
          l.type = 'lead'
          AND (
            p_lead_stage_ids IS NULL
            OR array_length(p_lead_stage_ids, 1) IS NULL
            OR l.stage_id = ANY(p_lead_stage_ids)
            OR l.stage_id IS NULL
          )
        )
        OR (
          l.type = 'deal'
          AND (
            p_deal_stage_ids IS NULL
            OR array_length(p_deal_stage_ids, 1) IS NULL
            OR l.stage_id = ANY(p_deal_stage_ids)
            OR l.stage_id IS NULL
          )
        )
      )
  ),
  type_agg AS (
    SELECT
      type,
      COUNT(*)::bigint AS all_total,
      COUNT(*) FILTER (WHERE has_phone)::bigint AS has_phone_total,
      COUNT(*) FILTER (WHERE NOT has_display_phone)::bigint AS no_phone_total,
      COUNT(*) FILTER (
        WHERE p_phone_filter IS NULL
          OR TRIM(p_phone_filter) = ''
          OR TRIM(p_phone_filter) = 'all'
          OR (TRIM(p_phone_filter) = 'has_phone' AND has_phone)
          OR (TRIM(p_phone_filter) = 'no_phone' AND NOT has_display_phone)
      )::bigint AS selected_total
    FROM base
    GROUP BY type
  ),
  stage_agg AS (
    SELECT type, stage_id, COUNT(*)::bigint AS cnt
    FROM base
    WHERE p_phone_filter IS NULL
      OR TRIM(p_phone_filter) = ''
      OR TRIM(p_phone_filter) = 'all'
      OR (TRIM(p_phone_filter) = 'has_phone' AND has_phone)
      OR (TRIM(p_phone_filter) = 'no_phone' AND NOT has_display_phone)
    GROUP BY type, stage_id
  )
  SELECT jsonb_build_object(
    'lead', jsonb_build_object(
      'all', COALESCE((SELECT all_total FROM type_agg WHERE type = 'lead'), 0),
      'has_phone', COALESCE((SELECT has_phone_total FROM type_agg WHERE type = 'lead'), 0),
      'no_phone', COALESCE((SELECT no_phone_total FROM type_agg WHERE type = 'lead'), 0),
      'selected_total', COALESCE((SELECT selected_total FROM type_agg WHERE type = 'lead'), 0),
      'counts', COALESCE((
        SELECT jsonb_object_agg(COALESCE(stage_id::text, '__none__'), cnt)
        FROM stage_agg WHERE type = 'lead'
      ), '{}'::jsonb)
    ),
    'deal', jsonb_build_object(
      'all', COALESCE((SELECT all_total FROM type_agg WHERE type = 'deal'), 0),
      'has_phone', COALESCE((SELECT has_phone_total FROM type_agg WHERE type = 'deal'), 0),
      'no_phone', COALESCE((SELECT no_phone_total FROM type_agg WHERE type = 'deal'), 0),
      'selected_total', COALESCE((SELECT selected_total FROM type_agg WHERE type = 'deal'), 0),
      'counts', COALESCE((
        SELECT jsonb_object_agg(COALESCE(stage_id::text, '__none__'), cnt)
        FROM stage_agg WHERE type = 'deal'
      ), '{}'::jsonb)
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object(
    'lead', jsonb_build_object('all', 0, 'has_phone', 0, 'no_phone', 0, 'selected_total', 0, 'counts', '{}'::jsonb),
    'deal', jsonb_build_object('all', 0, 'has_phone', 0, 'no_phone', 0, 'selected_total', 0, 'counts', '{}'::jsonb)
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_filter_summary(
  uuid, uuid, uuid, boolean, boolean, uuid, text, text, text, text,
  uuid[], boolean, uuid[], uuid[], text, uuid, text, text
) TO service_role;

GRANT EXECUTE ON FUNCTION public.crm_filter_summary(
  uuid, uuid, uuid, boolean, boolean, uuid, text, text, text, text,
  uuid[], boolean, uuid[], uuid[], text, uuid, text, text
) TO authenticated;

COMMENT ON FUNCTION public.crm_filter_summary(
  uuid, uuid, uuid, boolean, boolean, uuid, text, text, text, text,
  uuid[], boolean, uuid[], uuid[], text, uuid, text, text
) IS 'Một lần quét cho tổng Lead/Deal, bucket SĐT và stage counts theo bộ lọc CRM Dashboard.';

NOTIFY pgrst, 'reload schema';
