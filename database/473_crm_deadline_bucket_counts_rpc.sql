-- 473: Đếm bucket Deadline trực tiếp trong PostgreSQL.
-- Backend chỉ cần lấy tập id đã lọc rồi gọi một RPC aggregate, không hydrate
-- hàng nghìn card / task / user flag qua nhiều request PostgREST.

CREATE INDEX IF NOT EXISTS idx_crm_tasks_open_deadline_by_lead
  ON public.crm_tasks (lead_id, deadline)
  WHERE status IN ('pending', 'in_progress') AND deadline IS NOT NULL;

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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_week_start date := date_trunc(
    'week',
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::date;
  v_result jsonb;
BEGIN
  WITH selected AS (
    SELECT
      l.id,
      l.stage_entered_at,
      l.kanban_deadline_at,
      l.expected_close_date,
      (
        NULLIF(TRIM(COALESCE(c.phone::text, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(l.phone::text, '')), '') IS NOT NULL
      ) AS has_display_phone,
      COALESCE(uf.is_interacted, false) AS is_interacted,
      st.sla_days
    FROM public.crm_leads l
    JOIN public.crm_pipeline_stages st ON st.id = l.stage_id
    LEFT JOIN public.customers c ON c.id = l.customer_id
    LEFT JOIN public.crm_lead_user_flags uf
      ON uf.lead_id = l.id
      AND uf.user_id = p_viewer_user_id
    WHERE l.id = ANY(COALESCE(p_lead_ids, ARRAY[]::uuid[]))
      AND (
        p_stage_ids IS NULL
        OR array_length(p_stage_ids, 1) IS NULL
        OR l.stage_id = ANY(p_stage_ids)
      )
      AND COALESCE(st.is_won, false) = false
      AND COALESCE(st.is_lost, false) = false
      AND COALESCE(st.counts_as_completed_revenue, false) = false
      AND COALESCE(st.canonical_slug, '') NOT IN ('won', 'lost')
      AND COALESCE(st.deal_report_bucket, '') NOT IN ('won', 'lost')
  ),
  task_deadlines AS (
    SELECT t.lead_id, MIN(t.deadline) AS deadline
    FROM public.crm_tasks t
    WHERE t.lead_id = ANY(COALESCE(p_lead_ids, ARRAY[]::uuid[]))
      AND t.status IN ('pending', 'in_progress')
      AND t.deadline IS NOT NULL
    GROUP BY t.lead_id
  ),
  effective AS (
    SELECT
      s.id,
      CASE
        WHEN NOT s.has_display_phone OR s.is_interacted THEN NULL
        ELSE COALESCE(
          td.deadline,
          s.kanban_deadline_at,
          CASE
            WHEN s.stage_entered_at IS NULL OR COALESCE(s.sla_days, 7) = 0 THEN NULL
            ELSE (
              (
                (s.stage_entered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                + GREATEST(COALESCE(s.sla_days, 7), 1)
              )::date + time '23:59:59.999999'
            ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
          END,
          CASE WHEN p_include_expected_close THEN s.expected_close_date ELSE NULL END
        )
      END AS deadline_at
    FROM selected s
    LEFT JOIN task_deadlines td ON td.lead_id = s.id
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN deadline_at IS NULL THEN 'no_deadline'
        WHEN deadline_at < (v_today::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'overdue'
        WHEN deadline_at < ((v_today + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'today'
        WHEN deadline_at < ((v_today + 2)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'tomorrow'
        WHEN deadline_at < ((v_week_start + 7)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'this_week'
        WHEN deadline_at < ((v_week_start + 14)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') THEN 'next_week'
        WHEN deadline_at <= (
          (v_today + GREATEST(COALESCE(p_in_2_weeks_days, 14), 1))::timestamp
          AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ) THEN 'in_2_weeks'
        WHEN deadline_at <= (
          (v_today + GREATEST(COALESCE(p_in_3_weeks_days, 21), 1))::timestamp
          AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ) THEN 'in_3_weeks'
        WHEN deadline_at <= (
          (v_today + GREATEST(COALESCE(p_in_4_weeks_days, 28), 1))::timestamp
          AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ) THEN 'in_4_weeks'
        WHEN deadline_at <= (
          (v_today + GREATEST(COALESCE(p_in_1_month_days, 30), 1))::timestamp
          AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ) THEN 'in_1_month'
        WHEN deadline_at >= (
          date_trunc('month', v_today::timestamp) + interval '1 month'
        ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
          AND deadline_at < (
            date_trunc('month', v_today::timestamp) + interval '2 months'
          ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
          THEN 'next_month'
        ELSE 'in_1_month'
      END AS bucket
    FROM effective
  ),
  aggregated AS (
    SELECT bucket, COUNT(*)::bigint AS count
    FROM bucketed
    GROUP BY bucket
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
    'total',
    COALESCE(SUM(count), 0)
  )
  INTO v_result
  FROM aggregated;

  RETURN COALESCE(
    v_result,
    jsonb_build_object(
      'counts',
      jsonb_build_object(
        'overdue', 0,
        'today', 0,
        'tomorrow', 0,
        'this_week', 0,
        'next_week', 0,
        'in_2_weeks', 0,
        'in_3_weeks', 0,
        'in_4_weeks', 0,
        'in_1_month', 0,
        'next_month', 0,
        'no_deadline', 0
      ),
      'total',
      0
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.crm_deadline_bucket_counts(
  uuid[], uuid[], uuid, boolean, integer, integer, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.crm_deadline_bucket_counts(
  uuid[], uuid[], uuid, boolean, integer, integer, integer, integer
) IS 'Đếm chính xác các bucket Deadline CRM trong một truy vấn DB';
