-- 495: Phúc Đạt — đảm bảo 4 nhiệm vụ cột SX «Chuẩn bị vật tư» trên bộ mẫu
-- và backfill crm_tasks (sx_vat_tu) cho mọi deal đã có dự án SX (nếu chưa có).
-- Nhiệm vụ:
--   1. Đặt phụ kiện
--   2. Mô tả công trình
--   3. Đặt kính ốp
--   4. Báo giá mét cho xưởng

BEGIN;

DO $$
DECLARE
  v_phuc_dat UUID;
  v_stage_id UUID;
  v_template_id UUID;
  v_next_order INT;
  n_items INT := 0;
  n_tasks INT := 0;
  r_item RECORD;
BEGIN
  SELECT id INTO v_phuc_dat
  FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_phuc_dat IS NULL THEN
    RAISE NOTICE '495: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_stage_id
  FROM production_pipeline_stages
  WHERE company_id = v_phuc_dat
    AND is_active = true
    AND lower(trim(name)) = lower('Chuẩn bị vật tư')
  ORDER BY order_index
  LIMIT 1;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION '495: Không tìm thấy cột SX «Chuẩn bị vật tư» của Phúc Đạt.';
  END IF;

  SELECT id INTO v_template_id
  FROM workshop_task_templates
  WHERE company_id = v_phuc_dat
    AND workshop_area = 'production'
    AND production_stage_id = v_stage_id
  ORDER BY created_at
  LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id,
      production_stage_id, is_active, is_default, order_index
    ) VALUES (
      'Chuẩn bị vật tư',
      'production',
      'Danh mục công việc chuẩn bị vật tư của Phúc Đạt.',
      v_phuc_dat,
      v_stage_id,
      true,
      false,
      3
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- 1) Đảm bảo 4 mục trên bộ mẫu (idempotent theo title)
  FOR r_item IN
    SELECT * FROM (VALUES
      ('Đặt kính ốp', 2),
      ('Đặt phụ kiện', 4),
      ('Mô tả công trình', 5),
      ('Báo giá mét cho xưởng', 6)
    ) AS x(title, order_index)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM workshop_task_template_items i
      WHERE i.template_id = v_template_id
        AND lower(trim(i.title)) = lower(trim(r_item.title))
    ) THEN
      SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_next_order
      FROM workshop_task_template_items
      WHERE template_id = v_template_id;

      INSERT INTO workshop_task_template_items (
        template_id, title, priority, deadline_days, order_index, checklist
      ) VALUES (
        v_template_id,
        r_item.title,
        'medium',
        0,
        COALESCE(NULLIF(r_item.order_index, 0), v_next_order),
        '[]'::jsonb
      );
      n_items := n_items + 1;
    END IF;
  END LOOP;

  -- 2) Backfill crm_tasks sx_vat_tu cho deal Phúc Đạt đã gắn dự án
  FOR r_item IN
    SELECT * FROM (VALUES
      ('Đặt kính ốp'),
      ('Đặt phụ kiện'),
      ('Mô tả công trình'),
      ('Báo giá mét cho xưởng')
    ) AS x(title)
  LOOP
    INSERT INTO crm_tasks (
      lead_id,
      title,
      description,
      status,
      priority,
      stage_slug,
      production_pipeline_stage_id,
      order_index,
      checklist,
      shared_to_project,
      allowed_share_modules,
      created_by,
      created_at,
      updated_at
    )
    SELECT
      l.id,
      r_item.title,
      'Nhiệm vụ sản xuất — chuẩn bị vật tư (Phúc Đạt)',
      'pending',
      'medium',
      'sx_vat_tu',
      v_stage_id,
      COALESCE((
        SELECT MAX(t2.order_index) FROM crm_tasks t2
        WHERE t2.lead_id = l.id AND t2.stage_slug = 'sx_vat_tu'
      ), 0) + 1,
      '[]'::jsonb,
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
          AND lower(trim(t.title)) = lower(trim(r_item.title))
      );

    GET DIAGNOSTICS v_next_order = ROW_COUNT;
    n_tasks := n_tasks + v_next_order;
  END LOOP;

  RAISE NOTICE '495: Phúc Đạt=% stage=% template=% | mục mẫu mới=% | task deal backfill=%',
    v_phuc_dat, v_stage_id, v_template_id, n_items, n_tasks;
END $$;

COMMIT;
