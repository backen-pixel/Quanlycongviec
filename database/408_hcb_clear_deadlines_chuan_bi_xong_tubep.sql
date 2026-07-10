-- 408: HCB — Tủ bếp — cột «ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG»: xóa toàn bộ deadline thẻ/deal
-- (production_deadline, delivery_date, sx_kanban_deadline_at + kanban_deadline CRM)

DO $$
DECLARE
  v_company_id UUID;
  v_stage_id UUID;
  v_workshop_type_id UUID;
  v_projects INT := 0;
  v_deals INT := 0;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE name ILIKE '%Hucabi%' OR name ILIKE '%HCB%'
  ORDER BY CASE WHEN name ILIKE '%Hucabi%' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE '408: Không tìm thấy công ty HCB/Hucabi — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_workshop_type_id
  FROM workshop_project_types
  WHERE company_id = v_company_id AND lower(trim(name)) = lower('Tủ bếp')
  LIMIT 1;

  IF v_workshop_type_id IS NULL THEN
    RAISE NOTICE '408: Không tìm thấy phân loại Tủ bếp tại HCB — bỏ qua.';
    RETURN;
  END IF;

  SELECT pps.id INTO v_stage_id
  FROM production_pipeline_stages pps
  WHERE pps.company_id = v_company_id
    AND pps.workshop_type_id = v_workshop_type_id
    AND trim(pps.name) = 'ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG'
  LIMIT 1;

  IF v_stage_id IS NULL THEN
    RAISE NOTICE '408: Không tìm thấy cột pipeline — bỏ qua.';
    RETURN;
  END IF;

  WITH target AS (
    SELECT p.id AS project_id
    FROM projects p
    JOIN production_pipeline_stages pps ON pps.workflow_stage_id = p.current_stage_id
      AND pps.company_id = p.company_id
      AND pps.workshop_type_id = p.workshop_type_id
    WHERE pps.id = v_stage_id
  )
  UPDATE projects p
  SET production_deadline = NULL,
      delivery_date = NULL,
      sx_kanban_deadline_at = NULL,
      sx_kanban_deadline_reason = NULL,
      updated_at = NOW()
  FROM target t
  WHERE p.id = t.project_id
    AND (
      p.production_deadline IS NOT NULL
      OR p.delivery_date IS NOT NULL
      OR p.sx_kanban_deadline_at IS NOT NULL
      OR p.sx_kanban_deadline_reason IS NOT NULL
    );

  GET DIAGNOSTICS v_projects = ROW_COUNT;

  WITH target AS (
    SELECT p.id AS project_id
    FROM projects p
    JOIN production_pipeline_stages pps ON pps.workflow_stage_id = p.current_stage_id
      AND pps.company_id = p.company_id
      AND pps.workshop_type_id = p.workshop_type_id
    WHERE pps.id = v_stage_id
  )
  UPDATE crm_leads l
  SET kanban_deadline_at = NULL,
      kanban_deadline_reason = NULL,
      updated_at = NOW()
  FROM target t
  WHERE l.project_id = t.project_id
    AND l.type = 'deal'
    AND (l.kanban_deadline_at IS NOT NULL OR l.kanban_deadline_reason IS NOT NULL);

  GET DIAGNOSTICS v_deals = ROW_COUNT;

  RAISE NOTICE '408 HCB Tủ bếp / ĐƠN HÀNG ĐÃ CHUẨN BỊ XONG: % dự án, % deal CRM deadline đã xóa.',
    v_projects, v_deals;
END $$;
