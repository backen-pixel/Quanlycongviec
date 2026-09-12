-- 588: HCB · Tủ bếp — Kanban SX chỉ tới Hoàn thiện; Công nợ sang phân loại riêng.
-- Cột SX: Tiếp nhận → Kế hoạch → Duyệt → Gia công (6 việc) → Hoàn thiện.
-- Giao hàng / lắp đặt giữ ở board VC/LĐ. Idempotent.

CREATE OR REPLACE FUNCTION _hcb_588_merge_sx_stages(p_keep UUID, p_olds UUID[])
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_keep IS NULL OR coalesce(array_length(p_olds, 1), 0) = 0 THEN
    RETURN;
  END IF;
  UPDATE projects SET sx_kanban_column_id = p_keep, updated_at = NOW()
  WHERE sx_kanban_column_id = ANY (p_olds);
  UPDATE crm_leads SET sx_pipeline_stage_id = p_keep, updated_at = NOW()
  WHERE sx_pipeline_stage_id = ANY (p_olds);
  UPDATE crm_tasks SET production_pipeline_stage_id = p_keep, updated_at = NOW()
  WHERE production_pipeline_stage_id = ANY (p_olds);
  UPDATE tasks SET production_stage_id = p_keep
  WHERE production_stage_id = ANY (p_olds);
  UPDATE workshop_task_templates t
  SET production_stage_id = p_keep
  WHERE production_stage_id = ANY (p_olds)
    AND NOT EXISTS (
      SELECT 1 FROM workshop_task_templates t2
      WHERE t2.production_stage_id = p_keep
        AND t2.company_id = t.company_id
        AND lower(trim(t2.name)) = lower(trim(t.name))
    );
  INSERT INTO production_pipeline_stage_default_staff (
    production_pipeline_stage_id, user_id, order_index, is_primary
  )
  SELECT p_keep, s.user_id, s.order_index, s.is_primary
  FROM production_pipeline_stage_default_staff s
  WHERE s.production_pipeline_stage_id = ANY (p_olds)
    AND NOT EXISTS (
      SELECT 1 FROM production_pipeline_stage_default_staff s2
      WHERE s2.production_pipeline_stage_id = p_keep AND s2.user_id = s.user_id
    );
  UPDATE production_pipeline_stages SET bucket_slug = NULL
  WHERE id = ANY (p_olds) AND bucket_slug IS NOT NULL;
  DELETE FROM production_pipeline_stages WHERE id = ANY (p_olds);
END;
$$;

DO $$
DECLARE
  v_hcb UUID;
  v_tubep UUID;
  v_congno UUID;
  v_tiep UUID;
  v_kh UUID;
  v_duyet UUID;
  v_gc UUID;
  v_ht UUID;
  v_old UUID[];
  v_tpl UUID;
  v_created_by UUID;
  v_moved_cn INT := 0;
  r_item RECORD;
  v_batch INT := 0;
  v_tasks INT := 0;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE short_name ILIKE 'HCB' OR name ILIKE '%Hucabi%' OR name ILIKE '%HCB%'
  ORDER BY CASE WHEN short_name ILIKE 'HCB' THEN 0 WHEN name ILIKE '%Hucabi%' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '588: Không tìm thấy HCB — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_tubep
  FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp'
  LIMIT 1;

  IF v_tubep IS NULL THEN
    RAISE NOTICE '588: Không tìm thấy phân loại Tủ bếp HCB — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_congno
  FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'công nợ'
  LIMIT 1;

  IF v_congno IS NULL THEN
    INSERT INTO workshop_project_types (
      company_id, name, applies_to, order_index, is_active, description, updated_at
    ) VALUES (
      v_hcb,
      'Công nợ',
      'production',
      90,
      true,
      'Nhánh thu công nợ sau giao — không dùng khi đặt xưởng / tạo dự án SX mới.',
      NOW()
    )
    RETURNING id INTO v_congno;
  ELSE
    UPDATE workshop_project_types
    SET applies_to = 'production',
        is_active = true,
        description = COALESCE(
          NULLIF(trim(description), ''),
          'Nhánh thu công nợ sau giao — không dùng khi đặt xưởng / tạo dự án SX mới.'
        ),
        updated_at = NOW()
    WHERE id = v_congno;
  END IF;

  SELECT id INTO v_tiep FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND lower(trim(name)) IN ('tiếp nhận', 'tiếp nhận đơn hàng về sx')
  ORDER BY order_index LIMIT 1;

  SELECT id INTO v_kh FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND lower(trim(name)) IN ('kế hoạch', 'thiết kế & lập kế hoạch nvl', 'thiết kế và lập kế hoạch nvl')
  ORDER BY order_index LIMIT 1;

  SELECT id INTO v_duyet FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND lower(trim(name)) IN ('duyệt', 'sản xuất kiểm tra chéo đặt kính')
  ORDER BY order_index LIMIT 1;

  SELECT id INTO v_gc FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND lower(trim(name)) IN ('gia công', 'cb vật tư bán thành phẩm', 'ban thành phẩm')
  ORDER BY CASE WHEN lower(trim(name)) = 'gia công' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  SELECT id INTO v_ht FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND lower(trim(name)) IN ('hoàn thiện', 'kt kcs sản phẩm, tính cn')
  ORDER BY CASE WHEN lower(trim(name)) = 'hoàn thiện' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  IF v_tiep IS NULL OR v_kh IS NULL OR v_duyet IS NULL OR v_gc IS NULL OR v_ht IS NULL THEN
    RAISE NOTICE '588: Thiếu cột gốc Tủ bếp (tiep=%, kh=%, duyet=%, gc=%, ht=%) — bỏ qua.',
      v_tiep, v_kh, v_duyet, v_gc, v_ht;
    RETURN;
  END IF;

  UPDATE production_pipeline_stages
  SET name = 'Tiếp nhận', color = '#6366F1', icon = '📥', order_index = 1,
      is_active = true, crm_sync_type = 'production', deadline_group = 'planning',
      is_handover_to_logistics = false, bucket_slug = NULL
  WHERE id = v_tiep;

  UPDATE production_pipeline_stages
  SET name = 'Kế hoạch', color = '#8B5CF6', icon = '📐', order_index = 2,
      is_active = true, crm_sync_type = 'production', deadline_group = 'planning',
      is_handover_to_logistics = false, bucket_slug = NULL
  WHERE id = v_kh;

  UPDATE production_pipeline_stages
  SET name = 'Duyệt', color = '#0EA5E9', icon = '✔️', order_index = 3,
      is_active = true, crm_sync_type = 'production', deadline_group = 'planning',
      is_handover_to_logistics = false, bucket_slug = NULL
  WHERE id = v_duyet;

  UPDATE production_pipeline_stages
  SET bucket_slug = NULL
  WHERE company_id = v_hcb AND id <> v_gc AND bucket_slug IN ('ban_thanh_pham', 'hcb_tb_gia_cong');

  UPDATE production_pipeline_stages
  SET name = 'Gia công', color = '#EA580C', icon = '🏭', order_index = 4,
      is_active = true, crm_sync_type = 'production', deadline_group = 'cabinet',
      is_handover_to_logistics = false, bucket_slug = 'hcb_tb_gia_cong'
  WHERE id = v_gc;

  UPDATE production_pipeline_stages
  SET name = 'Hoàn thiện', color = '#16A34A', icon = '✅', order_index = 5,
      is_active = true, crm_sync_type = 'production', deadline_group = 'finishing',
      is_handover_to_logistics = true, bucket_slug = NULL
  WHERE id = v_ht;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_old
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND id <> v_gc
    AND lower(trim(trailing ',' FROM trim(name))) IN (
      'đang sx thùng',
      'ht nhôm nguyên tấm',
      'ht nhôm lá ghép nhỏ',
      'ban thành phẩm'
    );
  PERFORM _hcb_588_merge_sx_stages(v_gc, v_old);

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_old
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND id <> v_ht
    AND lower(trim(trailing ',' FROM trim(name))) IN (
      'đơn hàng đã chuẩn bị xong',
      'đơn hàng ngày mai giao',
      'đơn hàng đã giao'
    );
  PERFORM _hcb_588_merge_sx_stages(v_ht, v_old);

  UPDATE production_pipeline_stages
  SET workshop_type_id = v_congno,
      is_handover_to_logistics = false,
      deadline_group = NULL,
      crm_sync_type = 'production'
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND lower(name) LIKE '%công nợ%';

  UPDATE production_pipeline_stages
  SET name = 'CÔNG NỢ ĐÃ TÍNH', icon = '🧾', color = '#64748B', order_index = 1
  WHERE company_id = v_hcb AND workshop_type_id = v_congno
    AND lower(regexp_replace(trim(name), '[,\\s]+$', '')) = 'công nợ đã tính';

  UPDATE production_pipeline_stages
  SET name = 'CÔNG NỢ ĐANG ĐỐI CHIẾU', icon = '🔎', color = '#475569', order_index = 2
  WHERE company_id = v_hcb AND workshop_type_id = v_congno
    AND (
      lower(trim(name)) LIKE '%đối chiếu%'
      OR lower(trim(name)) LIKE '%đôi chiếu%'
    );

  UPDATE production_pipeline_stages
  SET name = 'CÔNG NỢ ĐÃ CHỐT', icon = '💰', color = '#16A34A', order_index = 3
  WHERE company_id = v_hcb AND workshop_type_id = v_congno
    AND lower(trim(name)) LIKE '%đã chốt%';

  UPDATE production_pipeline_stages
  SET name = 'CÔNG NỢ ĐÃ THANH TOÁN', icon = '📨', color = '#1E40AF', order_index = 4
  WHERE company_id = v_hcb AND workshop_type_id = v_congno
    AND lower(trim(name)) LIKE '%thanh toán%';

  UPDATE projects p
  SET workshop_type_id = v_congno, updated_at = NOW()
  WHERE p.company_id = v_hcb
    AND p.sx_kanban_column_id IN (
      SELECT id FROM production_pipeline_stages
      WHERE company_id = v_hcb AND workshop_type_id = v_congno
    );
  GET DIAGNOSTICS v_moved_cn = ROW_COUNT;

  SELECT id INTO v_tpl
  FROM workshop_task_templates
  WHERE company_id = v_hcb
    AND workshop_area = 'production'
    AND production_stage_id = v_gc
  ORDER BY created_at
  LIMIT 1;

  IF v_tpl IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, workshop_type_id,
      production_stage_id, is_active, is_default, order_index
    ) VALUES (
      'Gia công',
      'production',
      'HCB Tủ bếp — Gia công: chuẩn bị vật tư, đặt kính, sơn, thùng, alu, cánh.',
      v_hcb, v_tubep, v_gc, true, false, 4
    )
    RETURNING id INTO v_tpl;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'Gia công',
        workshop_type_id = v_tubep,
        is_active = true,
        description = 'HCB Tủ bếp — Gia công: chuẩn bị vật tư, đặt kính, sơn, thùng, alu, cánh.'
    WHERE id = v_tpl;
  END IF;

  UPDATE workshop_task_template_items
  SET title = 'Chuẩn bị vật tư', order_index = 1,
      description = COALESCE(NULLIF(trim(description), ''), 'Chuẩn bị / đặt vật tư')
  WHERE template_id = v_tpl AND lower(trim(title)) IN ('đặt vật tư', 'chuẩn bị vật tư');

  UPDATE workshop_task_template_items
  SET title = 'Đặt kính', order_index = 2,
      description = COALESCE(NULLIF(trim(description), ''), 'Đặt / gia công kính')
  WHERE template_id = v_tpl AND lower(trim(title)) IN ('kính', 'đặt kính');

  UPDATE workshop_task_template_items
  SET order_index = 3,
      description = COALESCE(NULLIF(trim(description), ''), 'Sơn')
  WHERE template_id = v_tpl AND lower(trim(title)) = 'sơn';

  UPDATE workshop_task_template_items
  SET order_index = 4,
      description = COALESCE(NULLIF(trim(description), ''), 'Sản xuất thùng')
  WHERE template_id = v_tpl AND lower(trim(title)) = 'thùng';

  UPDATE workshop_task_template_items
  SET title = 'Alu', order_index = 5,
      description = COALESCE(NULLIF(trim(description), ''), 'Nhôm / ALU')
  WHERE template_id = v_tpl AND lower(trim(title)) IN ('alu', 'nhôm');

  UPDATE workshop_task_template_items
  SET order_index = 6,
      description = COALESCE(NULLIF(trim(description), ''), 'Cắt / sản xuất cánh')
  WHERE template_id = v_tpl AND lower(trim(title)) = 'cánh';

  FOR r_item IN
    SELECT * FROM (VALUES
      ('Chuẩn bị vật tư', 'Chuẩn bị / đặt vật tư', 1),
      ('Đặt kính', 'Đặt / gia công kính', 2),
      ('Sơn', 'Sơn', 3),
      ('Thùng', 'Sản xuất thùng', 4),
      ('Alu', 'Nhôm / ALU', 5),
      ('Cánh', 'Cắt / sản xuất cánh', 6)
    ) AS x(title, description, order_index)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM workshop_task_template_items i
      WHERE i.template_id = v_tpl AND lower(trim(i.title)) = lower(trim(r_item.title))
    ) THEN
      INSERT INTO workshop_task_template_items (
        template_id, title, description, priority, deadline_days,
        order_index, checklist, blocks_stage_advance
      ) VALUES (
        v_tpl, r_item.title, r_item.description, 'medium', 0,
        r_item.order_index, '[]'::jsonb, true
      );
    ELSE
      UPDATE workshop_task_template_items
      SET order_index = r_item.order_index, blocks_stage_advance = true
      WHERE template_id = v_tpl AND lower(trim(title)) = lower(trim(r_item.title));
    END IF;
  END LOOP;

  SELECT COALESCE(
    (SELECT id FROM users WHERE company_id = v_hcb AND is_active IS DISTINCT FROM false ORDER BY created_at LIMIT 1),
    (SELECT id FROM users WHERE is_active IS DISTINCT FROM false ORDER BY created_at LIMIT 1)
  ) INTO v_created_by;

  FOR r_item IN
    SELECT * FROM (VALUES
      ('Chuẩn bị vật tư', 1),
      ('Đặt kính', 2),
      ('Sơn', 3),
      ('Thùng', 4),
      ('Alu', 5),
      ('Cánh', 6)
    ) AS x(title, order_index)
  LOOP
    INSERT INTO crm_tasks (
      lead_id, title, description, status, priority, stage_slug,
      production_pipeline_stage_id, order_index, checklist,
      shared_to_project, allowed_share_modules, blocks_stage_advance,
      created_by, created_at, updated_at
    )
    SELECT
      l.id, r_item.title, 'Nhiệm vụ Gia công — HCB Tủ bếp',
      'pending', 'medium', 'sx_gia_cong', v_gc, r_item.order_index,
      '[]'::jsonb, true, '["production"]'::jsonb, true,
      COALESCE(l.assigned_to, l.created_by, l.lead_owner_id, v_created_by),
      NOW(), NOW()
    FROM crm_leads l
    JOIN projects p ON p.id = l.project_id
    WHERE l.type = 'deal'
      AND p.company_id = v_hcb
      AND p.workshop_type_id = v_tubep
      AND (p.sx_kanban_column_id = v_gc OR l.sx_pipeline_stage_id = v_gc)
      AND NOT EXISTS (
        SELECT 1 FROM crm_tasks t
        WHERE t.lead_id = l.id
          AND t.production_pipeline_stage_id = v_gc
          AND lower(trim(t.title)) = lower(r_item.title)
      );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_tasks := v_tasks + v_batch;
  END LOOP;

  RAISE NOTICE '588 HCB Tủ bếp: công nợ chuyển % dự án; backfill % việc gia công.', v_moved_cn, v_tasks;
END $$;

DROP FUNCTION IF EXISTS _hcb_588_merge_sx_stages(UUID, UUID[]);
