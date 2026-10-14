-- Private projection for server-side aggregate queries. Browser roles cannot
-- read work-plan documents through this view. No legacy rows are backfilled.
CREATE VIEW public.unified_work_tasks_v WITH (security_invoker = true) AS
WITH approved AS (
  SELECT i.*, i.document->'active' AS active
  FROM public.work_plan_instances i
  WHERE i.document->'active'->>'plan_schema_version' = '2'
    AND jsonb_typeof(i.document->'active'->'planned_tasks') = 'array'
), legacy AS (
  SELECT u.* FROM public.unified_tasks_v u
  WHERE NOT EXISTS (
    SELECT 1 FROM approved a WHERE a.project_id = u.project_id
      AND ((u.source::text = 'task' AND u.task_kind IN ('SX', 'Dự án'))
        OR (u.source::text = 'crm_task' AND EXISTS (
          SELECT 1 FROM public.crm_tasks c WHERE c.id::text = u.source_id
            AND (c.production_pipeline_stage_id IS NOT NULL OR left(c.stage_slug, 3) = 'sx_')
        )))
  )
)
SELECT unified_id, source::text AS source, source_id, project_id, lead_id,
  company_id, title, description, status, priority, assignee_id, deadline,
  completed_at, created_by_id, created_at, updated_at, task_kind,
  project_code, project_name, lead_title, is_primary_lead
FROM legacy
UNION ALL
SELECT 'work_plan:' || a.project_id::text || ':' || (t->>'id'),
  'work_plan'::text, a.project_id::text || ':' || (t->>'id'),
  a.project_id, NULL::uuid, a.company_id, t->>'name', NULL::text,
  CASE WHEN coalesce((e.state->>'needs_review')::boolean, false) THEN 'blocked'
    WHEN e.state->>'status' = 'done' THEN 'done'
    WHEN e.state->>'status' = 'waived' THEN 'cancelled'
    WHEN e.state->>'status' = 'doing' THEN 'in_progress'
    ELSE 'pending' END,
  'normal'::text, nullif(t->>'assignee_id', '')::uuid,
  (t->>'deadline')::timestamptz,
  (e.state->>'completed_at')::timestamptz,
  NULL::uuid, (a.active->>'approved_at')::timestamptz, a.updated_at,
  'SX'::text, p.code, p.name, NULL::text, true
FROM approved a JOIN public.projects p ON p.id = a.project_id
CROSS JOIN LATERAL jsonb_array_elements(a.active->'planned_tasks') t
CROSS JOIN LATERAL (SELECT coalesce(a.document->'execution'->(t->>'id'), '{}'::jsonb) AS state) e;

REVOKE ALL ON public.unified_work_tasks_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.unified_work_tasks_v TO service_role;
COMMENT ON VIEW public.unified_work_tasks_v IS
  'Server-only approved work-plan task projection. Exact baseline deadlines; canonical execution. CRM and logistics retain their own records. Enable WORK_PLANS_AGGREGATES_ENABLED only after migration.';
