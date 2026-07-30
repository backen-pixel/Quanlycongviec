-- 484: VPT — tắt toàn bộ deadline tự thiết lập tại khu vực TP.Hồ Chí Minh (mã HCM).
-- Áp dụng cho cả Lead và Deal; không ảnh hưởng khu vực Q2.
-- Giữ nguyên nhiệm vụ đã hoàn thành/hủy để không làm thay đổi lịch sử.

DO $$
DECLARE
  v_company_id UUID := '991dc79d-cbf5-49f9-a364-35227cb47635';
  v_region_id UUID := 'f68e643d-7999-442c-83ee-edb7f5237ab1';
  v_stage_ids UUID[];
  v_tpl_items INT := 0;
  v_tasks INT := 0;
BEGIN
  SELECT ARRAY_AGG(ps.id) INTO v_stage_ids
  FROM crm_pipeline_stages ps
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE p.company_id = v_company_id
    AND p.region_id = v_region_id;

  IF v_stage_ids IS NOT NULL AND array_length(v_stage_ids, 1) IS NOT NULL THEN
    UPDATE crm_task_template_items i
    SET deadline_days = 0,
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
  END IF;

  UPDATE crm_tasks t
  SET deadline = NULL,
      deadline_days = 0,
      deadline_hours = 0,
      deadline_minutes = 0,
      updated_at = now()
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = v_company_id
    AND l.region_id = v_region_id
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled')
    AND (
      t.deadline IS NOT NULL
      OR COALESCE(t.deadline_days, 0) <> 0
      OR COALESCE(t.deadline_hours, 0) <> 0
      OR COALESCE(t.deadline_minutes, 0) <> 0
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '484 VPT HCM: tpl_items_zeroed=%, open_crm_tasks_cleared=%',
    v_tpl_items, v_tasks;
END $$;
