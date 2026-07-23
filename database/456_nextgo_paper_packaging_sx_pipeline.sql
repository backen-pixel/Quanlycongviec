-- 456: Pipeline Sản xuất «Xưởng giấy / bao bì» cho Công Ty TNHH Bao Bì NextGo.
-- Company-scoped (workshop_type_id NULL = dùng chung mọi phân loại: Túi giấy, Hộp…).
-- Đồng bộ CRM: Sản xuất (crm_sync_type), Thiết kế / Giao hàng / Hoàn thành (crm_target_stage_id).
-- Không gán progress_percent — giống các công ty SX khác (không hiện thanh % trên thẻ).
-- Idempotent.

DO $$
DECLARE
  v_nextgo UUID;
  v_prod_ws UUID;
  v_crm_design UUID;
  v_crm_ship UUID;
  v_crm_done UUID;
  n_ins INT := 0;
BEGIN
  SELECT id INTO v_nextgo
  FROM companies
  WHERE name ILIKE '%NextGo%' OR short_name ILIKE '%NextGo%'
  ORDER BY name
  LIMIT 1;

  IF v_nextgo IS NULL THEN
    RAISE EXCEPTION '456: Không tìm thấy công ty NextGo.';
  END IF;

  SELECT id INTO v_prod_ws FROM workflow_stages WHERE slug = 'production' LIMIT 1;

  SELECT s.id INTO v_crm_design
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE p.company_id = v_nextgo
    AND s.pipeline_type = 'deal'
    AND s.name ILIKE 'Thiết kế chi tiết'
  ORDER BY s.order_index
  LIMIT 1;

  SELECT s.id INTO v_crm_ship
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE p.company_id = v_nextgo
    AND s.pipeline_type = 'deal'
    AND s.name ILIKE 'Giao hàng'
  ORDER BY s.order_index
  LIMIT 1;

  SELECT s.id INTO v_crm_done
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE p.company_id = v_nextgo
    AND s.pipeline_type = 'deal'
    AND s.name ILIKE 'Hoàn thành'
  ORDER BY s.order_index
  LIMIT 1;

  -- Ẩn cột SX NextGo cũ không thuộc bộ mới (nếu có)
  UPDATE production_pipeline_stages
  SET is_active = false
  WHERE company_id = v_nextgo
    AND workshop_type_id IS NULL
    AND lower(trim(name)) NOT IN (
      lower('Chờ vào xưởng'),
      lower('Tiếp nhận đơn'),
      lower('Thiết kế chi tiết'),
      lower('Chuẩn bị NVL'),
      lower('Sản xuất'),
      lower('QC nội bộ'),
      lower('Đóng gói & xuất kho'),
      lower('Giao hàng'),
      lower('Hoàn thành')
    );

  INSERT INTO production_pipeline_stages (
    company_id,
    workshop_type_id,
    name,
    color,
    icon,
    order_index,
    is_active,
    workflow_stage_id,
    bucket_slug,
    crm_sync_type,
    crm_target_stage_id,
    is_handover_to_logistics,
    counts_as_completed_revenue,
    progress_percent
  )
  SELECT
    v_nextgo,
    NULL,
    s.name,
    s.color,
    s.icon,
    s.ord,
    true,
    CASE WHEN s.bucket = 'won_pending' THEN NULL ELSE v_prod_ws END,
    s.bucket,
    s.crm_sync,
    CASE s.name
      WHEN 'Thiết kế chi tiết' THEN v_crm_design
      WHEN 'Giao hàng' THEN v_crm_ship
      WHEN 'Hoàn thành' THEN v_crm_done
      ELSE NULL
    END,
    s.handover,
    s.done_rev,
    NULL
  FROM (VALUES
    (0,  'Chờ vào xưởng',      '#64748B', '⏳', 'won_pending'::text, NULL::text, false, false),
    (10, 'Tiếp nhận đơn',      '#6366F1', '📥', NULL, NULL, false, false),
    (20, 'Thiết kế chi tiết',  '#8B5CF6', '📐', NULL, NULL, false, false),
    (30, 'Chuẩn bị NVL',       '#0EA5E9', '📄', NULL, NULL, false, false),
    (40, 'Sản xuất',           '#F59E0B', '🏭', NULL, 'production', false, false),
    (50, 'QC nội bộ',          '#14B8A6', '✅', NULL, NULL, false, false),
    (60, 'Đóng gói & xuất kho','#FB923C', '📦', NULL, NULL, false, false),
    (70, 'Giao hàng',          '#10B981', '🚚', NULL, NULL, false, false),
    (80, 'Hoàn thành',         '#22C55E', '🏁', NULL, NULL, false, true)
  ) AS s(ord, name, color, icon, bucket, crm_sync, handover, done_rev)
  WHERE NOT EXISTS (
    SELECT 1 FROM production_pipeline_stages p
    WHERE p.company_id = v_nextgo
      AND p.workshop_type_id IS NULL
      AND lower(trim(p.name)) = lower(trim(s.name))
  );

  GET DIAGNOSTICS n_ins = ROW_COUNT;

  -- Đồng bộ lại flag / thứ tự / CRM link nếu cột đã tồn tại
  UPDATE production_pipeline_stages p
  SET
    color = s.color,
    icon = s.icon,
    order_index = s.ord,
    is_active = true,
    workflow_stage_id = CASE
      WHEN s.bucket = 'won_pending' THEN NULL
      ELSE COALESCE(p.workflow_stage_id, v_prod_ws)
    END,
    bucket_slug = s.bucket,
    crm_sync_type = s.crm_sync,
    crm_target_stage_id = CASE s.name
      WHEN 'Thiết kế chi tiết' THEN COALESCE(v_crm_design, p.crm_target_stage_id)
      WHEN 'Giao hàng' THEN COALESCE(v_crm_ship, p.crm_target_stage_id)
      WHEN 'Hoàn thành' THEN COALESCE(v_crm_done, p.crm_target_stage_id)
      ELSE p.crm_target_stage_id
    END,
    is_handover_to_logistics = s.handover,
    counts_as_completed_revenue = s.done_rev,
    progress_percent = NULL
  FROM (VALUES
    (0,  'Chờ vào xưởng',      '#64748B', '⏳', 'won_pending'::text, NULL::text, false, false),
    (10, 'Tiếp nhận đơn',      '#6366F1', '📥', NULL, NULL, false, false),
    (20, 'Thiết kế chi tiết',  '#8B5CF6', '📐', NULL, NULL, false, false),
    (30, 'Chuẩn bị NVL',       '#0EA5E9', '📄', NULL, NULL, false, false),
    (40, 'Sản xuất',           '#F59E0B', '🏭', NULL, 'production', false, false),
    (50, 'QC nội bộ',          '#14B8A6', '✅', NULL, NULL, false, false),
    (60, 'Đóng gói & xuất kho','#FB923C', '📦', NULL, NULL, false, false),
    (70, 'Giao hàng',          '#10B981', '🚚', NULL, NULL, false, false),
    (80, 'Hoàn thành',         '#22C55E', '🏁', NULL, NULL, false, true)
  ) AS s(ord, name, color, icon, bucket, crm_sync, handover, done_rev)
  WHERE p.company_id = v_nextgo
    AND p.workshop_type_id IS NULL
    AND lower(trim(p.name)) = lower(trim(s.name));

  RAISE NOTICE '456: NextGo=% | cột mới=% | CRM design=% ship=% done=%',
    v_nextgo, n_ins, v_crm_design, v_crm_ship, v_crm_done;
END $$;
