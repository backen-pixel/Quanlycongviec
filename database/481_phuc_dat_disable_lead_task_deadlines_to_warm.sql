-- 481: Phúc Đạt — tắt toàn bộ deadline nhiệm vụ lead từ cột đầu → Warm
-- (Mới / Liên hệ không trả lời / Cold / Warm). Giữ nguyên Hot.
-- 1) Zero offset trên bộ mẫu gắn stage
-- 2) Xóa deadline + offset trên nhiệm vụ mở của lead đang ở các cột đó

DO $$
DECLARE
  v_company_id UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_pipeline_id UUID := '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
  v_stage_ids UUID[] := ARRAY[
    '2907475f-6289-495e-8aea-5ba0ae0cd2b8'::uuid, -- Mới.
    '45346c31-2c4c-4eda-afc5-2c7ea98e545a'::uuid, -- Liên hệ không trả lời.
    'dff6549d-3c98-40bd-90fb-9b2fe8e72313'::uuid, -- Cold
    '4670b106-f007-4e07-8216-0e3b1cf7e6de'::uuid  -- Warm
  ];
  v_tpl_items INT := 0;
  v_tasks INT := 0;
BEGIN
  UPDATE crm_task_template_items i
  SET
    deadline_days = 0,
    deadline_hours = 0,
    deadline_minutes = 0
  FROM crm_task_templates t
  WHERE i.template_id = t.id
    AND t.pipeline_stage_id = ANY (v_stage_ids)
    AND (
      COALESCE(i.deadline_days, 0) <> 0
      OR COALESCE(i.deadline_hours, 0) <> 0
      OR COALESCE(i.deadline_minutes, 0) <> 0
    );

  GET DIAGNOSTICS v_tpl_items = ROW_COUNT;

  WITH target_leads AS (
    SELECT l.id
    FROM crm_leads l
    WHERE l.company_id = v_company_id
      AND l.stage_id = ANY (v_stage_ids)
  )
  UPDATE crm_tasks t
  SET
    deadline = NULL,
    deadline_days = 0,
    deadline_hours = 0,
    deadline_minutes = 0,
    updated_at = now()
  FROM target_leads tl
  WHERE t.lead_id = tl.id
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled')
    AND (
      t.deadline IS NOT NULL
      OR COALESCE(t.deadline_days, 0) <> 0
      OR COALESCE(t.deadline_hours, 0) <> 0
      OR COALESCE(t.deadline_minutes, 0) <> 0
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '481 Phúc Đạt lead→Warm: tpl_items_zeroed=%, open_tasks_cleared=% (pipeline %)',
    v_tpl_items, v_tasks, v_pipeline_id;
END $$;
