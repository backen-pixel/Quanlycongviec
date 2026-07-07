-- 404: Metalla — bộ nhiệm vụ mẫu «Báo giá» cho cột pipeline SX «Công nợ» (phân loại Data đầu ra)
-- Idempotent: bỏ qua nếu bộ mẫu đã tồn tại (company + workshop_type + production_stage).

BEGIN;

DO $$
DECLARE
  v_metala_id   UUID;
  v_type_id     UUID;
  v_stage_id    UUID;
  v_tpl_id      UUID;
  n_items       INT := 0;
BEGIN
  SELECT id INTO v_metala_id FROM companies
  WHERE name ILIKE '%Metall%' OR short_name ILIKE '%Metall%'
  ORDER BY name LIMIT 1;

  IF v_metala_id IS NULL THEN
    RAISE NOTICE '404: Không tìm thấy công ty Metalla — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_type_id FROM workshop_project_types
  WHERE company_id = v_metala_id AND lower(trim(name)) = lower('Data đầu ra')
  LIMIT 1;

  IF v_type_id IS NULL THEN
    RAISE NOTICE '404: Chưa có phân loại Data đầu ra — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_stage_id FROM production_pipeline_stages
  WHERE company_id = v_metala_id
    AND workshop_type_id = v_type_id
    AND lower(trim(name)) = lower('Công nợ')
    AND is_active = true
  ORDER BY order_index LIMIT 1;

  IF v_stage_id IS NULL THEN
    RAISE NOTICE '404: Chưa có cột pipeline Công nợ — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_tpl_id FROM workshop_task_templates
  WHERE company_id = v_metala_id
    AND workshop_type_id = v_type_id
    AND workshop_area = 'production'
    AND production_stage_id = v_stage_id
    AND lower(trim(name)) = lower('Báo giá')
  LIMIT 1;

  IF v_tpl_id IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, company_id, workshop_type_id, production_stage_id,
      is_active, is_default, order_index
    ) VALUES (
      'Báo giá', 'production', v_metala_id, v_type_id, v_stage_id,
      true, true, 5
    )
    RETURNING id INTO v_tpl_id;
  ELSE
    UPDATE workshop_task_templates
    SET is_active = true, is_default = true, production_stage_id = v_stage_id
    WHERE id = v_tpl_id;
  END IF;

  INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist)
  SELECT v_tpl_id, s.title, 'medium', 0, s.idx, '[]'::jsonb
  FROM (VALUES
    (1, 'Lập báo giá'),
    (2, 'Gửi báo giá cho khách')
  ) AS s(idx, title)
  WHERE NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = v_tpl_id AND lower(trim(i.title)) = lower(trim(s.title))
  );

  GET DIAGNOSTICS n_items = ROW_COUNT;

  RAISE NOTICE '404: Metalla=% | Data đầu ra=% | Công nợ=% | template Báo giá=% | mục mới=%',
    v_metala_id, v_type_id, v_stage_id, v_tpl_id, n_items;
END $$;

COMMIT;
