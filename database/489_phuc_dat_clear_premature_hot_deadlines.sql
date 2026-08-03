-- 489: Phúc Đạt — xóa deadline Hot tạo sớm khi lead chưa vào cột Hot.
-- Nguyên nhân: bộ mẫu HOT (Tư vấn lần 1/2/3) gắn deadline_days=3 và nhiệm vụ
-- được tạo ngay khi lead mới sinh → hạn 2/8 hiện trên lead đang ở Mới/Cold/Warm/Mất.
-- 1) Zero offset trên bộ mẫu HOT
-- 2) Xóa deadline trên NV Hot đang mở của lead KHÔNG ở cột Hot

DO $$
DECLARE
  v_company_id UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_hot_stage_id UUID := '2ed1fd4e-cb9f-4d7b-9af0-9785c9d63700';
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
    AND t.pipeline_stage_id = v_hot_stage_id
    AND (
      COALESCE(i.deadline_days, 0) <> 0
      OR COALESCE(i.deadline_hours, 0) <> 0
      OR COALESCE(i.deadline_minutes, 0) <> 0
    );

  GET DIAGNOSTICS v_tpl_items = ROW_COUNT;

  UPDATE crm_tasks t
  SET
    deadline = NULL,
    deadline_days = 0,
    deadline_hours = 0,
    deadline_minutes = 0
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = v_company_id
    AND t.pipeline_stage_id = v_hot_stage_id
    AND l.stage_id IS DISTINCT FROM v_hot_stage_id
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled')
    AND (
      t.deadline IS NOT NULL
      OR COALESCE(t.deadline_days, 0) <> 0
      OR COALESCE(t.deadline_hours, 0) <> 0
      OR COALESCE(t.deadline_minutes, 0) <> 0
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;

  RAISE NOTICE '489 Phúc Đạt: zero % mẫu HOT; clear % NV Hot premature deadline', v_tpl_items, v_tasks;
END $$;
