-- 610: HCB Cánh kính / Cửa — cột Tiếp nhận không chặn kéo sang sản xuất.
-- Migration 598 gán blocks_stage_advance=true cho mọi item mẫu (kể cả Cánh kính).
-- Nhiệm vụ «Vẽ lên kế hoạch sản xuất» nằm ở Tiếp nhận trong khi đã có cột kế hoạch riêng.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
BEGIN
  UPDATE workshop_task_template_items i
  SET blocks_stage_advance = false
  FROM workshop_task_templates t
  JOIN workshop_project_types wpt ON wpt.id = t.workshop_type_id
  JOIN production_pipeline_stages pps ON pps.id = t.production_stage_id
  WHERE i.template_id = t.id
    AND t.company_id = v_hcb
    AND t.workshop_area = 'production'
    AND lower(trim(wpt.name)) IN ('cánh kính', 'cửa')
    AND lower(trim(pps.name)) LIKE 'tiếp nhận%';

  UPDATE crm_tasks ct
  SET blocks_stage_advance = false
  FROM production_pipeline_stages pps
  JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
  WHERE ct.production_pipeline_stage_id = pps.id
    AND pps.company_id = v_hcb
    AND lower(trim(wpt.name)) IN ('cánh kính', 'cửa')
    AND lower(trim(pps.name)) LIKE 'tiếp nhận%';

  UPDATE tasks tsk
  SET blocks_stage_advance = false
  FROM production_pipeline_stages pps
  JOIN workshop_project_types wpt ON wpt.id = pps.workshop_type_id
  WHERE tsk.production_stage_id = pps.id
    AND pps.company_id = v_hcb
    AND lower(trim(wpt.name)) IN ('cánh kính', 'cửa')
    AND lower(trim(pps.name)) LIKE 'tiếp nhận%';
END $$;
