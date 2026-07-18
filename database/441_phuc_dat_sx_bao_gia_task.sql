-- 441: Phúc Đạt — thêm công việc SX «Báo giá» vào bộ mẫu Tiếp nhận + gán cho deal CRM đã có dự án.
-- Nhiệm vụ sx_* nên thấy được ở module Sản xuất (hideQuoteContract chỉ ẩn BG/HĐ thương mại CRM, không ẩn sx_*).

BEGIN;

DO $$
DECLARE
  v_phuc_dat UUID;
  v_tpl RECORD;
  v_next_order INT;
  n_items INT := 0;
  n_tasks INT := 0;
BEGIN
  SELECT id INTO v_phuc_dat FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_phuc_dat IS NULL THEN
    RAISE NOTICE '441: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  -- 1) Thêm mục «Báo giá» vào mọi bộ mẫu SX «Tiếp nhận» của Phúc Đạt
  FOR v_tpl IN
    SELECT id
    FROM workshop_task_templates
    WHERE company_id = v_phuc_dat
      AND workshop_area = 'production'
      AND is_active = true
      AND lower(trim(name)) = lower('Tiếp nhận')
  LOOP
    SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_next_order
    FROM workshop_task_template_items
    WHERE template_id = v_tpl.id;

    INSERT INTO workshop_task_template_items (
      template_id, title, priority, deadline_days, order_index, checklist
    )
    SELECT v_tpl.id, 'Báo giá', 'medium', 0, v_next_order, '[]'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM workshop_task_template_items i
      WHERE i.template_id = v_tpl.id
        AND lower(trim(i.title)) = lower('Báo giá')
    );
    GET DIAGNOSTICS v_next_order = ROW_COUNT;
    n_items := n_items + v_next_order;
  END LOOP;

  -- 2) Bộ mẫu riêng «Báo giá» (global, không gắn phân loại) — ensure-missing / deal chưa phân loại
  IF NOT EXISTS (
    SELECT 1 FROM workshop_task_templates
    WHERE company_id = v_phuc_dat
      AND workshop_area = 'production'
      AND workshop_type_id IS NULL
      AND lower(trim(name)) = lower('Báo giá')
  ) THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, company_id, workshop_type_id, production_stage_id,
      is_active, is_default, order_index
    ) VALUES (
      'Báo giá', 'production', v_phuc_dat, NULL, NULL,
      true, false, 0
    );
  END IF;

  INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist)
  SELECT t.id, 'Báo giá', 'medium', 0, 1, '[]'::jsonb
  FROM workshop_task_templates t
  WHERE t.company_id = v_phuc_dat
    AND t.workshop_area = 'production'
    AND t.workshop_type_id IS NULL
    AND lower(trim(t.name)) = lower('Báo giá')
    AND NOT EXISTS (
      SELECT 1 FROM workshop_task_template_items i
      WHERE i.template_id = t.id AND lower(trim(i.title)) = lower('Báo giá')
    );

  -- 3) Backfill crm_tasks sx_* «Báo giá» cho mọi deal CRM đã gắn dự án SX Phúc Đạt
  INSERT INTO crm_tasks (
    lead_id,
    title,
    description,
    status,
    priority,
    stage_slug,
    order_index,
    shared_to_project,
    allowed_share_modules,
    created_by,
    created_at,
    updated_at
  )
  SELECT
    l.id,
    'Báo giá',
    'Nhiệm vụ sản xuất — báo giá (Phúc Đạt)',
    'pending',
    'medium',
    'sx_tiep_nhan',
    COALESCE((
      SELECT MAX(t2.order_index) FROM crm_tasks t2
      WHERE t2.lead_id = l.id AND t2.stage_slug = 'sx_tiep_nhan'
    ), 0) + 1,
    true,
    '["production"]'::jsonb,
    COALESCE(l.assigned_to, l.created_by, l.lead_owner_id),
    NOW(),
    NOW()
  FROM crm_leads l
  JOIN projects p ON p.id = l.project_id
  WHERE l.type = 'deal'
    AND p.company_id = v_phuc_dat
    AND NOT EXISTS (
      SELECT 1 FROM crm_tasks t
      WHERE t.lead_id = l.id
        AND t.stage_slug LIKE 'sx_%'
        AND lower(trim(t.title)) = lower('Báo giá')
    );

  GET DIAGNOSTICS n_tasks = ROW_COUNT;

  RAISE NOTICE '441: Phúc Đạt=% | mục mẫu Tiếp nhận mới=% | task deal backfill=%',
    v_phuc_dat, n_items, n_tasks;
END $$;

COMMIT;
