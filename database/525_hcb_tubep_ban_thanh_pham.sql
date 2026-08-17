-- 525: HCB — Tủ bếp: gom 6 cột SX (cắt cánh / kế hoạch thùng / đang SX thùng / đội sơn)
-- thành 1 cột «Ban thành phẩm» với 5 nhiệm vụ: Thùng, Kính, Sơn, Cánh, Đặt vật tư.
-- Idempotent.

DO $$
DECLARE
  v_hcb UUID;
  v_tubep UUID;
  v_keep UUID;
  v_tpl UUID;
  v_old UUID[];
  v_moved_projects INT := 0;
  v_moved_leads INT := 0;
  v_deleted_stages INT := 0;
  v_items INT := 0;
  v_tasks INT := 0;
  v_batch INT := 0;
  v_created_by UUID;
  r_item RECORD;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE short_name ILIKE 'HCB'
     OR name ILIKE '%Hucabi%'
     OR name ILIKE '%HCB%'
  ORDER BY CASE
    WHEN short_name ILIKE 'HCB' THEN 0
    WHEN name ILIKE '%Hucabi%' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '525: Không tìm thấy công ty HCB/Hucabi — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_tubep
  FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp'
  LIMIT 1;

  IF v_tubep IS NULL THEN
    RAISE NOTICE '525: Không tìm thấy phân loại Tủ bếp tại HCB — bỏ qua.';
    RETURN;
  END IF;

  -- Cột đích (đã gom) hoặc cột đầu trong nhóm cũ
  SELECT id INTO v_keep
  FROM production_pipeline_stages
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND lower(trim(name)) = 'ban thành phẩm'
  ORDER BY order_index
  LIMIT 1;

  IF v_keep IS NULL THEN
    SELECT id INTO v_keep
    FROM production_pipeline_stages
    WHERE company_id = v_hcb
      AND workshop_type_id = v_tubep
      AND lower(trim(trailing ',' FROM trim(name))) IN (
        'đang cắt cánh',
        'kế hoạch sx thùng hợp kim',
        'kế hoạch sx thùng lá ghép',
        'đang sx thùng hợp kim + 100 x 16',
        'sx thùng hợp kim + 100 x 16',
        'đang sx thùng lá ghép nhỏ',
        'đội sơn'
      )
    ORDER BY order_index, name
    LIMIT 1;
  END IF;

  IF v_keep IS NULL THEN
    INSERT INTO production_pipeline_stages (
      company_id, workshop_type_id, name, color, icon, order_index,
      is_active, workflow_stage_id, bucket_slug, crm_sync_type, is_handover_to_logistics
    )
    SELECT
      v_hcb,
      v_tubep,
      'Ban thành phẩm',
      '#EA580C',
      '🏭',
      COALESCE((
        SELECT MIN(pps.order_index)
        FROM production_pipeline_stages pps
        WHERE pps.company_id = v_hcb AND pps.workshop_type_id = v_tubep
      ), 5),
      true,
      (SELECT id FROM workflow_stages WHERE slug = 'production' LIMIT 1),
      'ban_thanh_pham',
      'production',
      false
    RETURNING id INTO v_keep;
  ELSE
    UPDATE production_pipeline_stages
    SET name = 'Ban thành phẩm',
        icon = '🏭',
        color = '#EA580C',
        bucket_slug = COALESCE(NULLIF(trim(bucket_slug), ''), 'ban_thanh_pham'),
        is_active = true,
        crm_sync_type = COALESCE(crm_sync_type, 'production')
    WHERE id = v_keep;
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_old
  FROM production_pipeline_stages
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND id <> v_keep
    AND lower(trim(trailing ',' FROM trim(name))) IN (
      'đang cắt cánh',
      'kế hoạch sx thùng hợp kim',
      'kế hoạch sx thùng lá ghép',
      'đang sx thùng hợp kim + 100 x 16',
      'sx thùng hợp kim + 100 x 16',
      'đang sx thùng lá ghép nhỏ',
      'đội sơn',
      'ban thành phẩm'
    );

  IF coalesce(array_length(v_old, 1), 0) > 0 THEN
    UPDATE projects
    SET sx_kanban_column_id = v_keep, updated_at = NOW()
    WHERE sx_kanban_column_id = ANY (v_old);
    GET DIAGNOSTICS v_moved_projects = ROW_COUNT;

    UPDATE crm_leads
    SET sx_pipeline_stage_id = v_keep, updated_at = NOW()
    WHERE sx_pipeline_stage_id = ANY (v_old);
    GET DIAGNOSTICS v_moved_leads = ROW_COUNT;

    UPDATE crm_tasks
    SET production_pipeline_stage_id = v_keep, updated_at = NOW()
    WHERE production_pipeline_stage_id = ANY (v_old);

    UPDATE tasks
    SET production_stage_id = v_keep
    WHERE production_stage_id = ANY (v_old);

    UPDATE workshop_task_templates
    SET production_stage_id = v_keep
    WHERE production_stage_id = ANY (v_old)
      AND NOT EXISTS (
        SELECT 1 FROM workshop_task_templates t2
        WHERE t2.production_stage_id = v_keep
          AND t2.company_id = workshop_task_templates.company_id
          AND lower(trim(t2.name)) = lower(trim(workshop_task_templates.name))
      );

    INSERT INTO production_pipeline_stage_default_staff (
      production_pipeline_stage_id, user_id, order_index, is_primary
    )
    SELECT v_keep, s.user_id, s.order_index, s.is_primary
    FROM production_pipeline_stage_default_staff s
    WHERE s.production_pipeline_stage_id = ANY (v_old)
      AND NOT EXISTS (
        SELECT 1 FROM production_pipeline_stage_default_staff s2
        WHERE s2.production_pipeline_stage_id = v_keep AND s2.user_id = s.user_id
      );

    DELETE FROM production_pipeline_stages WHERE id = ANY (v_old);
    GET DIAGNOSTICS v_deleted_stages = ROW_COUNT;
  END IF;

  -- Đánh lại thứ tự cột Tủ bếp HCB
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY order_index, name) AS rn
    FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_tubep
  )
  UPDATE production_pipeline_stages p
  SET order_index = o.rn
  FROM ordered o
  WHERE p.id = o.id AND p.order_index IS DISTINCT FROM o.rn;

  SELECT id INTO v_tpl
  FROM workshop_task_templates
  WHERE company_id = v_hcb
    AND workshop_area = 'production'
    AND production_stage_id = v_keep
  ORDER BY created_at
  LIMIT 1;

  IF v_tpl IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, workshop_type_id,
      production_stage_id, is_active, is_default, order_index
    ) VALUES (
      'Ban thành phẩm',
      'production',
      'Nhiệm vụ cột Ban thành phẩm HCB (Tủ bếp): Thùng, Kính, Sơn, Cánh, Đặt vật tư.',
      v_hcb,
      v_tubep,
      v_keep,
      true,
      false,
      5
    )
    RETURNING id INTO v_tpl;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'Ban thành phẩm',
        workshop_type_id = COALESCE(workshop_type_id, v_tubep),
        is_active = true,
        description = COALESCE(
          NULLIF(trim(description), ''),
          'Nhiệm vụ cột Ban thành phẩm HCB (Tủ bếp): Thùng, Kính, Sơn, Cánh, Đặt vật tư.'
        )
    WHERE id = v_tpl;
  END IF;

  FOR r_item IN
    SELECT * FROM (VALUES
      ('Thùng', 'Sản xuất thùng (hợp kim / lá ghép)', 1),
      ('Kính', 'Cắt / gia công kính', 2),
      ('Sơn', 'Sơn hoàn thiện', 3),
      ('Cánh', 'Cắt / sản xuất cánh', 4),
      ('Đặt vật tư', 'Đặt vật tư cho bán thành phẩm', 5)
    ) AS x(title, description, order_index)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM workshop_task_template_items i
      WHERE i.template_id = v_tpl
        AND lower(trim(i.title)) = lower(trim(r_item.title))
    ) THEN
      INSERT INTO workshop_task_template_items (
        template_id, title, description, priority, deadline_days,
        order_index, checklist, blocks_stage_advance
      ) VALUES (
        v_tpl,
        r_item.title,
        r_item.description,
        'medium',
        0,
        r_item.order_index,
        '[]'::jsonb,
        true
      );
      v_items := v_items + 1;
    ELSE
      UPDATE workshop_task_template_items
      SET order_index = r_item.order_index,
          description = COALESCE(NULLIF(trim(description), ''), r_item.description),
          blocks_stage_advance = true
      WHERE template_id = v_tpl
        AND lower(trim(title)) = lower(trim(r_item.title));
    END IF;
  END LOOP;

  SELECT COALESCE(
    (SELECT id FROM users WHERE company_id = v_hcb AND is_active IS DISTINCT FROM false ORDER BY created_at LIMIT 1),
    (SELECT id FROM users WHERE is_active IS DISTINCT FROM false ORDER BY created_at LIMIT 1)
  ) INTO v_created_by;

  -- Backfill nhiệm vụ cho deal đang nằm ở cột Ban thành phẩm
  FOR r_item IN
    SELECT * FROM (VALUES
      ('Thùng', 1),
      ('Kính', 2),
      ('Sơn', 3),
      ('Cánh', 4),
      ('Đặt vật tư', 5)
    ) AS x(title, order_index)
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
      blocks_stage_advance,
      created_by,
      created_at,
      updated_at
    )
    SELECT
      l.id,
      r_item.title,
      'Nhiệm vụ Ban thành phẩm — HCB Tủ bếp',
      'pending',
      'medium',
      'sx_ban_thanh_pham',
      v_keep,
      r_item.order_index,
      '[]'::jsonb,
      true,
      '["production"]'::jsonb,
      true,
      COALESCE(l.assigned_to, l.created_by, l.lead_owner_id, v_created_by),
      NOW(),
      NOW()
    FROM crm_leads l
    JOIN projects p ON p.id = l.project_id
    WHERE l.type = 'deal'
      AND p.company_id = v_hcb
      AND p.workshop_type_id = v_tubep
      AND (
        p.sx_kanban_column_id = v_keep
        OR l.sx_pipeline_stage_id = v_keep
      )
      AND NOT EXISTS (
        SELECT 1 FROM crm_tasks t
        WHERE t.lead_id = l.id
          AND t.production_pipeline_stage_id = v_keep
          AND lower(trim(t.title)) = lower(trim(r_item.title))
      );

    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_tasks := v_tasks + v_batch;
  END LOOP;

  -- Task «Sơn» (và task cũ khác) đã có: gắn đúng cột + slug mới
  UPDATE crm_tasks t
  SET production_pipeline_stage_id = v_keep,
      stage_slug = 'sx_ban_thanh_pham',
      updated_at = NOW()
  WHERE t.production_pipeline_stage_id = v_keep
    AND lower(trim(t.title)) IN ('thùng', 'kính', 'sơn', 'cánh', 'đặt vật tư')
    AND t.stage_slug IS DISTINCT FROM 'sx_ban_thanh_pham';

  RAISE NOTICE '525 HCB Tủ bếp Ban thành phẩm: keep=% tpl=% | xóa cột=% | chuyển dự án=% | mục mẫu mới=% | task backfill=%',
    v_keep, v_tpl, v_deleted_stages, v_moved_projects, v_items, v_tasks;
END $$;
