-- 483: VPT — tắt toàn bộ deadline nhiệm vụ Lead.
-- 1) Đưa offset deadline trong mọi bộ mẫu Lead thuộc các pipeline VPT về 0.
-- 2) Xóa deadline/offset trên mọi nhiệm vụ đang mở của Lead VPT.
-- Giữ nguyên nhiệm vụ đã hoàn thành/hủy để không làm thay đổi lịch sử.

DO $$
DECLARE
  v_company_ids UUID[];
  v_lead_stage_ids UUID[];
  v_tpl_items INT := 0;
  v_tasks INT := 0;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_company_ids
  FROM companies
  WHERE id = '991dc79d-cbf5-49f9-a364-35227cb47635'
     OR name ILIKE '%Vạn Phú Thành%';

  IF v_company_ids IS NULL OR array_length(v_company_ids, 1) IS NULL THEN
    RAISE NOTICE '483: Không tìm thấy công ty VPT — bỏ qua.';
    RETURN;
  END IF;

  SELECT ARRAY_AGG(ps.id) INTO v_lead_stage_ids
  FROM crm_pipeline_stages ps
  JOIN crm_pipelines p ON p.id = ps.pipeline_id
  WHERE p.company_id = ANY (v_company_ids)
    AND COALESCE(ps.pipeline_type, 'lead') = 'lead';

  IF v_lead_stage_ids IS NOT NULL AND array_length(v_lead_stage_ids, 1) IS NOT NULL THEN
    UPDATE crm_task_template_items i
    SET deadline_days = 0,
        deadline_hours = 0,
        deadline_minutes = 0
    FROM crm_task_templates t
    WHERE i.template_id = t.id
      AND t.pipeline_stage_id = ANY (v_lead_stage_ids)
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
    AND l.company_id = ANY (v_company_ids)
    AND l.type = 'lead'
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled')
    AND (
      t.deadline IS NOT NULL
      OR COALESCE(t.deadline_days, 0) <> 0
      OR COALESCE(t.deadline_hours, 0) <> 0
      OR COALESCE(t.deadline_minutes, 0) <> 0
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '483 VPT: tpl_items_zeroed=%, open_lead_tasks_cleared=%, companies=%',
    v_tpl_items, v_tasks, v_company_ids;
END $$;
