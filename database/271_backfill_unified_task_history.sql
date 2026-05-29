-- 271_backfill_unified_task_history.sql
-- Import lịch sử cũ từ activity_logs, crm_kpi_ledger, crm_assignment_comments.
-- Chỉ chạy 1 lần — có cờ guard.

BEGIN;

-- Guard: bảng meta đánh dấu đã backfill
CREATE TABLE IF NOT EXISTS unified_task_history_meta (
  key   TEXT PRIMARY KEY,
  value TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM unified_task_history_meta WHERE key = 'backfill_v1') THEN
    RAISE NOTICE '271_backfill: đã chạy trước đó — bỏ qua.';
    RETURN;
  END IF;

  -- ─── activity_logs (entity_type = task) ───────────────────────────────────
  INSERT INTO unified_task_history (
    source, source_id, project_id, lead_id, company_id,
    actor_user_id, event_type, field_name, old_value, new_value, description, created_at
  )
  SELECT
    'task'::unified_task_source,
    al.entity_id::text,
    t.project_id,
    cl.id,
    COALESCE(p.company_id, cl.company_id),
    al.user_id,
    CASE al.action
      WHEN 'created' THEN 'created'
      WHEN 'deleted' THEN 'deleted'
      WHEN 'status_changed' THEN 'status_changed'
      ELSE al.action
    END,
    NULL,
    al.old_values,
    al.new_values,
    al.description,
    al.created_at
  FROM activity_logs al
  JOIN tasks t ON t.id = al.entity_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN crm_leads cl ON cl.project_id = t.project_id
  WHERE al.entity_type = 'task'
    AND NOT EXISTS (
      SELECT 1 FROM unified_task_history uh
      WHERE uh.source = 'task'
        AND uh.source_id = al.entity_id::text
        AND uh.event_type = CASE al.action
          WHEN 'created' THEN 'created'
          WHEN 'deleted' THEN 'deleted'
          WHEN 'status_changed' THEN 'status_changed'
          ELSE al.action
        END
        AND uh.created_at = al.created_at
    );

  -- ─── crm_kpi_ledger (task events) ─────────────────────────────────────────
  INSERT INTO unified_task_history (
    source, source_id, project_id, lead_id, company_id,
    actor_user_id, event_type, field_name, old_value, new_value, description, created_at
  )
  SELECT
    'crm_task'::unified_task_source,
    k.task_id::text,
    cl.project_id,
    k.lead_id,
    k.company_id,
    k.user_id,
    CASE k.event_type
      WHEN 'task_completed' THEN 'completed'
      ELSE k.event_type
    END,
    'status',
    NULL,
    jsonb_build_object('points', k.points, 'reason', k.reason),
    COALESCE(k.reason, 'KPI: ' || k.event_type),
    k.occurred_at
  FROM crm_kpi_ledger k
  JOIN crm_tasks ct ON ct.id = k.task_id
  LEFT JOIN crm_leads cl ON cl.id = k.lead_id
  WHERE k.task_id IS NOT NULL
    AND k.event_type IN ('task_completed', 'stage_changed')
    AND NOT EXISTS (
      SELECT 1 FROM unified_task_history uh
      WHERE uh.source = 'crm_task'
        AND uh.source_id = k.task_id::text
        AND uh.event_type = CASE k.event_type WHEN 'task_completed' THEN 'completed' ELSE k.event_type END
        AND uh.created_at = k.occurred_at
    );

  -- ─── crm_assignment_comments (lịch sử comment cũ) ─────────────────────────
  INSERT INTO unified_task_history (
    source, source_id, project_id, lead_id, company_id,
    actor_user_id, event_type, field_name, old_value, new_value, description, created_at
  )
  SELECT
    'crm_assignment'::unified_task_source,
    c.assignment_id::text,
    NULL,
    NULL,
    ca.company_id,
    c.user_id,
    'comment_added',
    'comment',
    NULL,
    jsonb_build_object('content', left(c.content, 500)),
    'Bình luận (backfill)',
    c.created_at
  FROM crm_assignment_comments c
  JOIN crm_assignments ca ON ca.id = c.assignment_id
  WHERE NOT EXISTS (
    SELECT 1 FROM unified_task_history uh
    WHERE uh.source = 'crm_assignment'
      AND uh.source_id = c.assignment_id::text
      AND uh.event_type = 'comment_added'
      AND uh.created_at = c.created_at
      AND uh.actor_user_id = c.user_id
  );

  INSERT INTO unified_task_history_meta (key, value)
  VALUES ('backfill_v1', 'done')
  ON CONFLICT (key) DO NOTHING;

  RAISE NOTICE '271_backfill: hoàn tất.';
END $$;

COMMIT;
