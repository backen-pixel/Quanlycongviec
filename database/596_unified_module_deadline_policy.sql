-- 596: Hàm deadline dùng chung theo module.
-- Không thêm/sửa bảng hoặc cột; chỉ bổ sung hàm dẫn xuất để RPC/API dùng cùng thứ tự.

BEGIN;

CREATE OR REPLACE FUNCTION public.company_deadline_at(
  p_date date,
  p_company_id uuid
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_date IS NULL THEN NULL
    ELSE (
      p_date
      + COALESCE(
        (
          SELECT cfg.default_deadline_time
          FROM public.sx_company_schedule_config cfg
          WHERE cfg.company_id = p_company_id
        ),
        time '17:30:00'
      )
    ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
  END;
$$;

CREATE OR REPLACE FUNCTION public.crm_effective_deadline_at(
  p_lead_id uuid,
  p_viewer_user_id uuid DEFAULT NULL,
  p_include_expected_close boolean DEFAULT true
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN l.deadline_disabled_at IS NOT NULL
      OR COALESCE(uf.is_interacted, false)
      OR (
        NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NULL
        AND NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NULL
      )
      OR COALESCE(st.is_won, false)
      OR COALESCE(st.is_lost, false)
      OR COALESCE(st.counts_as_completed_revenue, false)
      OR COALESCE(st.canonical_slug, '') IN ('won', 'lost', 'completed', 'done')
      OR COALESCE(st.deal_report_bucket, '') IN ('won', 'lost')
    THEN NULL
    ELSE COALESCE(
      (
        SELECT MIN(t.deadline)
        FROM public.crm_tasks t
        WHERE t.lead_id = l.id
          AND t.status IN ('pending', 'in_progress')
          AND t.deadline IS NOT NULL
          AND (t.pipeline_stage_id IS NULL OR t.pipeline_stage_id = l.stage_id)
      ),
      l.kanban_deadline_at,
      CASE
        WHEN l.stage_entered_at IS NULL OR COALESCE(st.sla_days, 7) = 0 THEN NULL
        ELSE public.company_deadline_at(
          (
            (l.stage_entered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            + GREATEST(COALESCE(st.sla_days, 7), 1)
          )::date,
          l.company_id
        )
      END,
      CASE
        WHEN p_include_expected_close
        THEN public.company_deadline_at(l.expected_close_date::date, l.company_id)
        ELSE NULL
      END
    )
  END
  FROM public.crm_leads l
  JOIN public.crm_pipeline_stages st ON st.id = l.stage_id
  LEFT JOIN public.customers c ON c.id = l.customer_id
  LEFT JOIN public.crm_lead_user_flags uf
    ON uf.lead_id = l.id
   AND uf.user_id = p_viewer_user_id
  WHERE l.id = p_lead_id;
$$;

CREATE OR REPLACE FUNCTION public.crm_deadline_bucket_key(
  p_deadline_at timestamptz,
  p_in_2_weeks_days integer DEFAULT 14,
  p_in_3_weeks_days integer DEFAULT 21,
  p_in_4_weeks_days integer DEFAULT 28,
  p_in_1_month_days integer DEFAULT 30
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    SELECT
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today,
      date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week_start
  )
  SELECT CASE
    WHEN p_deadline_at IS NULL THEN 'no_deadline'
    WHEN p_deadline_at < (today::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'overdue'
    WHEN p_deadline_at < ((today + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'today'
    WHEN p_deadline_at < ((today + 2)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'tomorrow'
    WHEN p_deadline_at < ((week_start + 7)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'this_week'
    WHEN p_deadline_at < ((week_start + 14)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'next_week'
    WHEN p_deadline_at <= (
      (today + GREATEST(COALESCE(p_in_2_weeks_days, 14), 1))::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ) THEN 'in_2_weeks'
    WHEN p_deadline_at <= (
      (today + GREATEST(COALESCE(p_in_3_weeks_days, 21), 1))::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ) THEN 'in_3_weeks'
    WHEN p_deadline_at <= (
      (today + GREATEST(COALESCE(p_in_4_weeks_days, 28), 1))::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ) THEN 'in_4_weeks'
    WHEN p_deadline_at <= (
      (today + GREATEST(COALESCE(p_in_1_month_days, 30), 1))::timestamp
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    ) THEN 'in_1_month'
    WHEN p_deadline_at >= (
      date_trunc('month', today::timestamp) + interval '1 month'
    ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
      AND p_deadline_at < (
        date_trunc('month', today::timestamp) + interval '2 months'
      ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
    THEN 'next_month'
    ELSE 'in_1_month'
  END
  FROM bounds;
$$;

CREATE OR REPLACE FUNCTION public.crm_deadline_bucket_counts(
  p_lead_ids uuid[],
  p_stage_ids uuid[] DEFAULT NULL,
  p_viewer_user_id uuid DEFAULT NULL,
  p_include_expected_close boolean DEFAULT true,
  p_in_2_weeks_days integer DEFAULT 14,
  p_in_3_weeks_days integer DEFAULT 21,
  p_in_4_weeks_days integer DEFAULT 28,
  p_in_1_month_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH selected AS (
    SELECT l.id, public.crm_effective_deadline_at(
      l.id,
      p_viewer_user_id,
      p_include_expected_close
    ) AS deadline_at
    FROM public.crm_leads l
    JOIN public.crm_pipeline_stages st ON st.id = l.stage_id
    WHERE l.id = ANY(COALESCE(p_lead_ids, ARRAY[]::uuid[]))
      AND (
        p_stage_ids IS NULL
        OR array_length(p_stage_ids, 1) IS NULL
        OR l.stage_id = ANY(p_stage_ids)
      )
      AND COALESCE(st.is_won, false) = false
      AND COALESCE(st.is_lost, false) = false
      AND COALESCE(st.counts_as_completed_revenue, false) = false
  ),
  grouped AS (
    SELECT public.crm_deadline_bucket_key(
      deadline_at,
      p_in_2_weeks_days,
      p_in_3_weeks_days,
      p_in_4_weeks_days,
      p_in_1_month_days
    ) AS bucket,
    COUNT(*)::bigint AS count
    FROM selected
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'counts',
    jsonb_build_object(
      'overdue', COALESCE(MAX(count) FILTER (WHERE bucket = 'overdue'), 0),
      'today', COALESCE(MAX(count) FILTER (WHERE bucket = 'today'), 0),
      'tomorrow', COALESCE(MAX(count) FILTER (WHERE bucket = 'tomorrow'), 0),
      'this_week', COALESCE(MAX(count) FILTER (WHERE bucket = 'this_week'), 0),
      'next_week', COALESCE(MAX(count) FILTER (WHERE bucket = 'next_week'), 0),
      'in_2_weeks', COALESCE(MAX(count) FILTER (WHERE bucket = 'in_2_weeks'), 0),
      'in_3_weeks', COALESCE(MAX(count) FILTER (WHERE bucket = 'in_3_weeks'), 0),
      'in_4_weeks', COALESCE(MAX(count) FILTER (WHERE bucket = 'in_4_weeks'), 0),
      'in_1_month', COALESCE(MAX(count) FILTER (WHERE bucket = 'in_1_month'), 0),
      'next_month', COALESCE(MAX(count) FILTER (WHERE bucket = 'next_month'), 0),
      'no_deadline', COALESCE(MAX(count) FILTER (WHERE bucket = 'no_deadline'), 0)
    ),
    'total', COALESCE(SUM(count), 0)
  )
  FROM grouped;
$$;

CREATE OR REPLACE FUNCTION public.crm_deadline_bucket_page_ids(
  p_lead_ids uuid[],
  p_stage_ids uuid[] DEFAULT NULL,
  p_viewer_user_id uuid DEFAULT NULL,
  p_requests jsonb DEFAULT '[]'::jsonb,
  p_include_expected_close boolean DEFAULT true,
  p_in_2_weeks_days integer DEFAULT 14,
  p_in_3_weeks_days integer DEFAULT 21,
  p_in_4_weeks_days integer DEFAULT 28,
  p_in_1_month_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH requests AS (
    SELECT DISTINCT ON (bucket)
      bucket,
      GREATEST(offset_value, 0) AS offset_value,
      LEAST(GREATEST(limit_value, 1), 20) AS limit_value
    FROM (
      SELECT
        NULLIF(TRIM(value->>'bucket'), '') AS bucket,
        COALESCE((value->>'offset')::integer, 0) AS offset_value,
        COALESCE((value->>'limit')::integer, 10) AS limit_value
      FROM jsonb_array_elements(COALESCE(p_requests, '[]'::jsonb)) value
    ) raw
    WHERE bucket IN (
      'overdue', 'today', 'tomorrow', 'this_week', 'next_week',
      'in_2_weeks', 'in_3_weeks', 'in_4_weeks', 'in_1_month',
      'next_month', 'no_deadline'
    )
  ),
  selected AS (
    SELECT l.id, public.crm_effective_deadline_at(
      l.id,
      p_viewer_user_id,
      p_include_expected_close
    ) AS deadline_at
    FROM public.crm_leads l
    JOIN public.crm_pipeline_stages st ON st.id = l.stage_id
    WHERE l.id = ANY(COALESCE(p_lead_ids, ARRAY[]::uuid[]))
      AND (
        p_stage_ids IS NULL
        OR array_length(p_stage_ids, 1) IS NULL
        OR l.stage_id = ANY(p_stage_ids)
      )
      AND COALESCE(st.is_won, false) = false
      AND COALESCE(st.is_lost, false) = false
      AND COALESCE(st.counts_as_completed_revenue, false) = false
  ),
  bucketed AS (
    SELECT id, deadline_at, public.crm_deadline_bucket_key(
      deadline_at,
      p_in_2_weeks_days,
      p_in_3_weeks_days,
      p_in_4_weeks_days,
      p_in_1_month_days
    ) AS bucket
    FROM selected
  ),
  ranked AS (
    SELECT id, bucket,
      ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY deadline_at ASC NULLS LAST, id) AS row_number,
      COUNT(*) OVER (PARTITION BY bucket) AS total
    FROM bucketed
  )
  SELECT jsonb_build_object(
    'pages',
    COALESCE(
      jsonb_object_agg(
        req.bucket,
        jsonb_build_object(
          'ids',
          COALESCE(
            (
              SELECT jsonb_agg(row.id ORDER BY row.row_number)
              FROM ranked row
              WHERE row.bucket = req.bucket
                AND row.row_number > req.offset_value
                AND row.row_number <= req.offset_value + req.limit_value
            ),
            '[]'::jsonb
          ),
          'total', COALESCE((SELECT MAX(row.total) FROM ranked row WHERE row.bucket = req.bucket), 0),
          'nextOffset', LEAST(
            req.offset_value + req.limit_value,
            COALESCE((SELECT MAX(row.total) FROM ranked row WHERE row.bucket = req.bucket), 0)
          ),
          'hasMore', req.offset_value + req.limit_value
            < COALESCE((SELECT MAX(row.total) FROM ranked row WHERE row.bucket = req.bucket), 0)
        )
      ),
      '{}'::jsonb
    )
  )
  FROM requests req;
$$;

CREATE OR REPLACE FUNCTION public.project_module_deadline_at(
  p public.projects,
  p_module text
)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT CASE lower(COALESCE(p_module, ''))
    WHEN 'production' THEN COALESCE(
      p.sx_kanban_deadline_at,
      public.company_deadline_at(p.production_finish_date::date, p.company_id),
      public.company_deadline_at(p.production_deadline::date, p.company_id),
      public.company_deadline_at(p.delivery_date::date, p.company_id),
      public.company_deadline_at(p.deadline::date, p.company_id)
    )
    WHEN 'logistics' THEN COALESCE(
      public.company_deadline_at(p.install_date::date, COALESCE(p.logistics_company_id, p.company_id)),
      public.company_deadline_at(p.delivery_date::date, COALESCE(p.logistics_company_id, p.company_id)),
      public.company_deadline_at(p.deadline::date, COALESCE(p.logistics_company_id, p.company_id))
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.project_deadline_at(p public.projects)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT public.project_module_deadline_at(p, 'production');
$$;

-- Đồng bộ RPC 570: KPI Kanban dùng cùng deadline Sản xuất chuẩn.
CREATE OR REPLACE FUNCTION public.project_kanban_board(
  p_stage_ids     uuid[],
  p_company_ids   uuid[]        DEFAULT NULL,
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_date_from     timestamptz   DEFAULT NULL,
  p_date_to       timestamptz   DEFAULT NULL,
  p_mode          text          DEFAULT 'summary',
  p_stage_id      uuid          DEFAULT NULL,
  p_offset        integer       DEFAULT 0,
  p_limit         integer       DEFAULT 40,
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
    WITH stages AS (
      SELECT s.id, s.slug, ord.i AS ord
      FROM unnest(p_stage_ids) WITH ORDINALITY AS ord(sid, i)
      JOIN workflow_stages s ON s.id = ord.sid
    ),
    first_stage AS (
      SELECT id FROM stages ORDER BY ord LIMIT 1
    ),
    base AS (
      SELECT p.id, p.status::text AS status, p.created_at,
             public.project_deadline_at(p) AS effective_deadline,
             p.estimated_value, p.current_stage_id
      FROM projects p
      WHERE (p_company_ids IS NULL OR p.company_id = ANY (p_company_ids))
        AND (p_tenant_company_ids IS NULL
          OR cardinality(p_tenant_company_ids) = 0
          OR p.company_id = ANY (p_tenant_company_ids)
          OR p.logistics_company_id = ANY (p_tenant_company_ids))
        AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
        AND (p_date_from IS NULL OR p.created_at >= p_date_from)
        AND (p_date_to IS NULL OR p.created_at <= p_date_to)
        AND (v_search IS NULL
          OR p.code ILIKE ('%' || v_search || '%')
          OR p.name ILIKE ('%' || v_search || '%'))
        AND (p_person_id IS NULL
          OR p.sales_person_id = p_person_id
          OR p.designer_id = p_person_id
          OR p.project_manager_id = p_person_id
          OR p.consulting_person_id = p_person_id
          OR p.design_person_id = p_person_id
          OR p.quotation_person_id = p_person_id
          OR p.contract_person_id = p_person_id
          OR p.production_person_id = p_person_id
          OR p.shipping_person_id = p_person_id
          OR p.installation_person_id = p_person_id
          OR p.care_person_id = p_person_id
          OR p.supervisor_id = p_person_id
          OR p.created_by = p_person_id::text
          OR EXISTS (
            SELECT 1 FROM tasks t
            WHERE t.project_id = p.id AND t.assignee_id = p_person_id
          ))
    ),
    resolved AS (
      SELECT b.*,
             COALESCE(
               (SELECT s.id FROM stages s WHERE s.id = b.current_stage_id),
               (SELECT s.id FROM stages s
                  JOIN workflow_stages cs
                    ON cs.id = b.current_stage_id AND cs.slug = s.slug
                 ORDER BY s.ord LIMIT 1),
               (SELECT s.id FROM stages s
                 WHERE s.slug = CASE lower(COALESCE(b.status, ''))
                   WHEN 'consulting' THEN 'order'
                   WHEN 'designing' THEN 'design'
                   WHEN 'quoting' THEN 'design'
                   WHEN 'contract_signed' THEN 'order'
                   WHEN 'producing' THEN 'production'
                   WHEN 'shipping' THEN 'delivery'
                   WHEN 'installing' THEN 'installation'
                   WHEN 'completed' THEN 'acceptance'
                   WHEN 'warranty' THEN 'warranty'
                   WHEN 'on_hold' THEN 'order'
                   WHEN 'new' THEN 'order'
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
          SELECT r.id, r.created_at
          FROM resolved r
          WHERE r.stage_id = p_stage_id
          ORDER BY r.created_at DESC
          OFFSET GREATEST(p_offset, 0)
          LIMIT LEAST(GREATEST(p_limit, 1), 200)
        ) x)
      ELSE
        (SELECT jsonb_build_object(
          'total', count(*),
          'counts', COALESCE((SELECT jsonb_object_agg(g.stage_id::text, g.n)
            FROM (SELECT stage_id, count(*) AS n FROM resolved GROUP BY stage_id) g), '{}'::jsonb),
          'working', count(*) FILTER (WHERE status IS NOT NULL AND status <> ''
            AND status NOT IN ('completed', 'warranty', 'on_hold')),
          'done', count(*) FILTER (WHERE status IN ('completed', 'warranty')),
          'overdue', count(*) FILTER (WHERE effective_deadline IS NOT NULL
            AND effective_deadline < now() AND status <> 'completed'),
          'no_deadline', count(*) FILTER (WHERE effective_deadline IS NULL),
          'value_sum', COALESCE(sum(estimated_value), 0)
        ) FROM resolved)
    END
  );
END;
$$;

-- Đồng bộ RPC 572: không lặp lại chuỗi COALESCE deadline cũ.
CREATE OR REPLACE FUNCTION public.project_deadline_board(
  p_bounds        timestamptz[],
  p_mode          text          DEFAULT 'summary',
  p_bucket        text          DEFAULT NULL,
  p_company_ids   uuid[]        DEFAULT NULL,
  p_customer_id   uuid          DEFAULT NULL,
  p_person_id     uuid          DEFAULT NULL,
  p_search        text          DEFAULT NULL,
  p_offset        integer       DEFAULT 0,
  p_limit         integer       DEFAULT 40,
  p_tenant_company_ids uuid[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH b AS (
  SELECT p_bounds[1] AS d0, p_bounds[2] AS d1, p_bounds[3] AS d2,
         p_bounds[4] AS d3, p_bounds[5] AS d4
),
base AS (
  SELECT p.id, p.created_at, p.status::text AS status,
         public.project_deadline_at(p) AS d
  FROM projects p
  WHERE (p_company_ids IS NULL OR p.company_id = ANY (p_company_ids))
    AND (p_tenant_company_ids IS NULL OR cardinality(p_tenant_company_ids) = 0
         OR p.company_id = ANY (p_tenant_company_ids)
         OR p.logistics_company_id = ANY (p_tenant_company_ids))
    AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
    AND (NULLIF(TRIM(COALESCE(p_search, '')), '') IS NULL
         OR p.code ILIKE ('%' || TRIM(p_search) || '%')
         OR p.name ILIKE ('%' || TRIM(p_search) || '%'))
    AND (p_person_id IS NULL
         OR p.sales_person_id = p_person_id OR p.designer_id = p_person_id
         OR p.project_manager_id = p_person_id OR p.consulting_person_id = p_person_id
         OR p.design_person_id = p_person_id OR p.quotation_person_id = p_person_id
         OR p.contract_person_id = p_person_id OR p.production_person_id = p_person_id
         OR p.shipping_person_id = p_person_id OR p.installation_person_id = p_person_id
         OR p.care_person_id = p_person_id OR p.supervisor_id = p_person_id
         OR p.created_by = p_person_id::text
         OR EXISTS (
           SELECT 1 FROM tasks t
           WHERE t.project_id = p.id AND t.assignee_id = p_person_id
         ))
),
bucketed AS (
  SELECT base.*, CASE
    WHEN base.d IS NOT NULL AND base.d < (SELECT d0 FROM b)
      AND base.status <> 'completed' THEN 'overdue'
    WHEN base.d >= (SELECT d0 FROM b) AND base.d < (SELECT d1 FROM b) THEN 'today'
    WHEN base.d >= (SELECT d1 FROM b) AND base.d < (SELECT d2 FROM b) THEN 'tomorrow'
    WHEN base.d >= (SELECT d2 FROM b) AND base.d < (SELECT d3 FROM b) THEN 'next_week'
    WHEN base.d >= (SELECT d3 FROM b) AND base.d < (SELECT d4 FROM b) THEN 'next_month'
    ELSE 'later'
  END AS bucket
  FROM base
)
SELECT CASE
  WHEN p_mode = 'page' THEN
    (SELECT jsonb_build_object(
       'ids', COALESCE((SELECT jsonb_agg(x.id ORDER BY x.created_at DESC)
                          FROM (SELECT id, created_at FROM bucketed
                                 WHERE bucket = p_bucket
                                 ORDER BY created_at DESC
                                 OFFSET GREATEST(p_offset, 0)
                                 LIMIT LEAST(GREATEST(p_limit, 1), 200)) x), '[]'::jsonb),
       'has_more', (SELECT count(*) FROM bucketed WHERE bucket = p_bucket) > (p_offset + p_limit),
       'total', (SELECT count(*) FROM bucketed WHERE bucket = p_bucket)))
  ELSE
    (SELECT jsonb_build_object(
       'total', (SELECT count(*) FROM bucketed),
       'counts', COALESCE((SELECT jsonb_object_agg(g.bucket, g.n)
                             FROM (SELECT bucket, count(*) AS n FROM bucketed GROUP BY bucket) g),
                          '{}'::jsonb)))
END;
$$;

COMMENT ON FUNCTION public.crm_effective_deadline_at(uuid, uuid, boolean) IS
  'Deadline CRM chuẩn: nhiệm vụ cột hiện tại -> hạn thẻ -> SLA -> dự kiến chốt.';
COMMENT ON FUNCTION public.company_deadline_at(date, uuid) IS
  'Quy đổi DATE thành giờ kết thúc ngày làm việc theo công ty, timezone Việt Nam.';
COMMENT ON FUNCTION public.project_module_deadline_at(public.projects, text) IS
  'Deadline chuẩn theo module production/logistics; không thay đổi schema.';
COMMENT ON FUNCTION public.project_deadline_at(public.projects) IS
  'Tương thích RPC dự án cũ; dùng chính sách deadline module Sản xuất.';

COMMIT;
