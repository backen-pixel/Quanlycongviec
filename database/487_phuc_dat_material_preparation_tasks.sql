-- 487: Phúc Đạt — thêm 5 nhiệm vụ cho cột SX «Chuẩn bị vật tư».
-- Bộ mẫu gắn trực tiếp cột pipeline; nhiệm vụ được tạo khi dự án đi vào cột.

BEGIN;

DO $$
DECLARE
  v_company_id UUID;
  v_stage RECORD;
  v_template_id UUID;
  v_inserted INT := 0;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '487: Không tìm thấy công ty Phúc Đạt.';
  END IF;

  SELECT id, workshop_type_id INTO v_stage
  FROM production_pipeline_stages
  WHERE company_id = v_company_id
    AND is_active = true
    AND lower(trim(name)) = lower('Chuẩn bị vật tư')
  ORDER BY order_index
  LIMIT 1;

  IF v_stage.id IS NULL THEN
    RAISE EXCEPTION '487: Không tìm thấy cột SX «Chuẩn bị vật tư» của Phúc Đạt.';
  END IF;

  SELECT id INTO v_template_id
  FROM workshop_task_templates
  WHERE company_id = v_company_id
    AND workshop_area = 'production'
    AND production_stage_id = v_stage.id
  ORDER BY created_at
  LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO workshop_task_templates (
      name,
      workshop_area,
      description,
      company_id,
      workshop_type_id,
      production_stage_id,
      is_active,
      is_default,
      order_index
    ) VALUES (
      'Chuẩn bị vật tư',
      'production',
      'Danh mục công việc chuẩn bị vật tư của Phúc Đạt.',
      v_company_id,
      v_stage.workshop_type_id,
      v_stage.id,
      true,
      false,
      3
    )
    RETURNING id INTO v_template_id;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'Chuẩn bị vật tư',
        description = 'Danh mục công việc chuẩn bị vật tư của Phúc Đạt.',
        workshop_type_id = v_stage.workshop_type_id,
        is_active = true
    WHERE id = v_template_id;
  END IF;

  INSERT INTO workshop_task_template_items (
    template_id,
    title,
    priority,
    deadline_days,
    order_index,
    checklist
  )
  SELECT
    v_template_id,
    item.title,
    'medium',
    0,
    item.order_index,
    '[]'::jsonb
  FROM (VALUES
    ('Bản danh mục chuẩn bị vật tư', 1),
    ('Đặt kính ốp', 2),
    ('Đặt Đá', 3),
    ('Đặt phụ kiện', 4),
    ('Mô tả công trình', 5)
  ) AS item(title, order_index)
  WHERE NOT EXISTS (
    SELECT 1
    FROM workshop_task_template_items existing
    WHERE existing.template_id = v_template_id
      AND lower(trim(existing.title)) = lower(trim(item.title))
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE '487: Phúc Đạt stage=% template=% inserted_items=%',
    v_stage.id, v_template_id, v_inserted;
END $$;

COMMIT;
