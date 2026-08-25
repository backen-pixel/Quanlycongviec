-- 564: RPC sx_kanban_column_counts — bỏ p.division_id (bảng projects không có cột này).
-- Khi p_restrict_project_ids có giá trị: không OR wonIds toàn hệ thống (Sale CRM VPT).

CREATE OR REPLACE FUNCTION public.sx_kanban_column_counts(
  p_stage_ids uuid[] DEFAULT NULL,
  p_won_ids uuid[] DEFAULT NULL,
  p_statuses text[] DEFAULT ARRAY['producing', 'shipping', 'installing', 'warranty', 'completed']::text[],
  p_company_id uuid DEFAULT NULL,
  p_partner_project_ids uuid[] DEFAULT NULL,
  p_restrict_project_ids uuid[] DEFAULT NULL,
  p_tenant_company_ids uuid[] DEFAULT NULL,
  p_workshop_type_id uuid DEFAULT NULL,
  p_unclassified boolean DEFAULT false,
  p_division_id uuid DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL,
  p_production_person_id uuid DEFAULT NULL,
  p_sx_intake_only boolean DEFAULT false,
  p_column_id uuid DEFAULT NULL,
  p_null_column_only boolean DEFAULT false,
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
  v_has_restrict boolean;
BEGIN
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
  v_has_restrict := p_restrict_project_ids IS NOT NULL AND cardinality(p_restrict_project_ids) > 0;

  WITH scoped AS (
    SELECT p.sx_kanban_column_id
    FROM projects p
    WHERE
      (
        CASE
          WHEN v_has_restrict THEN
            p.id = ANY (p_restrict_project_ids)
          WHEN COALESCE(p_sx_intake_only, false) THEN
            (p_won_ids IS NOT NULL AND cardinality(p_won_ids) > 0 AND p.id = ANY (p_won_ids))
            AND (
              p_stage_ids IS NULL
              OR cardinality(p_stage_ids) = 0
              OR p.current_stage_id IS NULL
              OR NOT (p.current_stage_id = ANY (p_stage_ids))
            )
          ELSE
            (
              (p_stage_ids IS NOT NULL AND cardinality(p_stage_ids) > 0 AND p.current_stage_id = ANY (p_stage_ids))
              OR (p_statuses IS NOT NULL AND cardinality(p_statuses) > 0 AND p.status::text = ANY (p_statuses))
              OR (p_won_ids IS NOT NULL AND cardinality(p_won_ids) > 0 AND p.id = ANY (p_won_ids))
            )
        END
      )
      AND (
        p_company_id IS NULL
        OR p.company_id = p_company_id
        OR (
          NOT v_has_restrict
          AND p_partner_project_ids IS NOT NULL
          AND cardinality(p_partner_project_ids) > 0
          AND p.id = ANY (p_partner_project_ids)
        )
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
      AND (
        p_division_id IS NULL
        OR p.company_id IN (SELECT c.id FROM companies c WHERE c.division_unit_id = p_division_id)
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
        CASE
          WHEN COALESCE(p_null_column_only, false) THEN p.sx_kanban_column_id IS NULL
          WHEN p_column_id IS NOT NULL THEN p.sx_kanban_column_id = p_column_id
          ELSE true
        END
      )
  ),
  grouped AS (
    SELECT
      COALESCE(sx_kanban_column_id::text, '__none__') AS col_key,
      COUNT(*)::int AS cnt
    FROM scoped
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT SUM(cnt) FROM grouped), 0),
    'counts', COALESCE(
      (SELECT jsonb_object_agg(col_key, cnt) FROM grouped WHERE cnt > 0),
      '{}'::jsonb
    ),
    'values', '{}'::jsonb
  )
  INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object('total', 0, 'counts', '{}'::jsonb, 'values', '{}'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.sx_kanban_column_counts IS
  'SX Kanban: aggregate project counts by sx_kanban_column_id. Restrict-ids path skips global won OR.';

GRANT EXECUTE ON FUNCTION public.sx_kanban_column_counts TO authenticated;
GRANT EXECUTE ON FUNCTION public.sx_kanban_column_counts TO service_role;
