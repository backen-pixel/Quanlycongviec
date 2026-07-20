-- 449: Phúc Đạt — tắt SLA 3 cột lead (Mới / Liên hệ không trả lời / Cold)
-- và xóa deadline còn lại trên lead chưa có SĐT (lead.phone trống).

DO $$
DECLARE
  v_company_id UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_pipeline_id UUID := '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
  v_stages INT := 0;
  v_leads INT := 0;
  v_tasks INT := 0;
BEGIN
  UPDATE crm_pipeline_stages
  SET sla_days = 0
  WHERE pipeline_id = v_pipeline_id
    AND id IN (
      '2907475f-6289-495e-8aea-5ba0ae0cd2b8', -- Mới.
      '45346c31-2c4c-4eda-afc5-2c7ea98e545a', -- Liên hệ không trả lời.
      'dff6549d-3c98-40bd-90fb-9b2fe8e72313'  -- Cold
    )
    AND (sla_days IS DISTINCT FROM 0);

  GET DIAGNOSTICS v_stages = ROW_COUNT;

  -- Lead chưa có SĐT trên field phone (kể cả khi customer có số lệch) tại Phúc Đạt
  WITH no_phone AS (
    SELECT l.id
    FROM crm_leads l
    WHERE l.company_id = v_company_id
      AND (l.phone IS NULL OR btrim(l.phone) = '')
  )
  UPDATE crm_leads l
  SET
    kanban_deadline_at = NULL,
    kanban_deadline_reason = NULL,
    updated_at = now()
  FROM no_phone n
  WHERE l.id = n.id
    AND (
      l.kanban_deadline_at IS NOT NULL
      OR COALESCE(l.kanban_deadline_reason, '') <> ''
    );

  GET DIAGNOSTICS v_leads = ROW_COUNT;

  WITH no_phone AS (
    SELECT l.id
    FROM crm_leads l
    WHERE l.company_id = v_company_id
      AND (l.phone IS NULL OR btrim(l.phone) = '')
  )
  UPDATE crm_tasks t
  SET
    deadline = NULL,
    updated_at = now()
  FROM no_phone n
  WHERE t.lead_id = n.id
    AND t.deadline IS NOT NULL
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled');

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '449: sla_off stages=%, cleared_kanban=%, cleared_tasks=%', v_stages, v_leads, v_tasks;
END $$;
