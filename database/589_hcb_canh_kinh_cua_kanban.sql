-- 589: HCB — Cánh kính + Cửa cùng mẫu Kanban 5 cột (tới Hoàn thiện).
-- Công nợ / hủy: chuyển nhánh Công nợ; giữ cột Hủy trên Cánh kính.

CREATE OR REPLACE FUNCTION _hcb_589_merge_sx_stages(p_keep UUID, p_olds UUID[])
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

CREATE OR REPLACE FUNCTION _hcb_589_ensure_gia_cong_tpl(p_hcb UUID, p_type UUID, p_gc UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tpl UUID;
  r_item RECORD;
BEGIN
  SELECT id INTO v_tpl
  FROM workshop_task_templates
  WHERE company_id = p_hcb AND workshop_area = 'production' AND production_stage_id = p_gc
  ORDER BY created_at LIMIT 1;

  IF v_tpl IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, workshop_type_id,
      production_stage_id, is_active, is_default, order_index
    ) VALUES (
      'Gia công', 'production',
      'HCB — Gia công: chuẩn bị vật tư, đặt kính, sơn, thùng, alu, cánh.',
      p_hcb, p_type, p_gc, true, false, 4
    )
    RETURNING id INTO v_tpl;
  ELSE
    UPDATE workshop_task_templates
    SET name = 'Gia công', workshop_type_id = p_type, is_active = true
    WHERE id = v_tpl;
  END IF;

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
      WHERE i.template_id = v_tpl AND lower(trim(i.title)) = lower(r_item.title)
    ) THEN
      INSERT INTO workshop_task_template_items (
        template_id, title, description, priority, deadline_days,
        order_index, checklist, blocks_stage_advance
      ) VALUES (
        v_tpl, r_item.title, r_item.description, 'medium', 0,
        r_item.order_index, '[]'::jsonb, true
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_hcb UUID;
  v_congno UUID;
  v_type UUID;
  v_tiep UUID;
  v_kh UUID;
  v_duyet UUID;
  v_gc UUID;
  v_ht UUID;
  v_old UUID[];
  r_type RECORD;
BEGIN
  SELECT id INTO v_hcb FROM companies
  WHERE short_name ILIKE 'HCB' OR name ILIKE '%Hucabi%'
  ORDER BY CASE WHEN short_name ILIKE 'HCB' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_hcb IS NULL THEN
    RAISE NOTICE '589: không có HCB';
    RETURN;
  END IF;

  SELECT id INTO v_congno FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'công nợ' LIMIT 1;
  IF v_congno IS NULL THEN
    INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active, description, updated_at)
    VALUES (v_hcb, 'Công nợ', 'production', 90, true,
      'Nhánh thu công nợ sau giao — không dùng khi đặt xưởng.', NOW())
    RETURNING id INTO v_congno;
  END IF;

  FOR r_type IN
    SELECT id, lower(trim(name)) AS n FROM workshop_project_types
    WHERE company_id = v_hcb AND lower(trim(name)) IN ('cánh kính', 'cửa')
  LOOP
    v_type := r_type.id;

    SELECT id INTO v_tiep FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND lower(trim(name)) IN ('tiếp nhận', 'tiếp nhận')
    ORDER BY CASE WHEN lower(trim(name)) = 'tiếp nhận' THEN 0 ELSE 1 END, order_index
    LIMIT 1;

    -- «Tiếp Nhận» (cánh kính)
    IF v_tiep IS NULL THEN
      SELECT id INTO v_tiep FROM production_pipeline_stages
      WHERE company_id = v_hcb AND workshop_type_id = v_type
        AND lower(trim(name)) LIKE 'tiếp nhận%'
      ORDER BY order_index LIMIT 1;
    END IF;

    SELECT id INTO v_kh FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND (
        lower(trim(name)) IN ('kế hoạch', 'thiết kế và lập kế hoạch', 'vẽ lên kế hoạch sản xuất')
        OR lower(trim(name)) LIKE '%kế hoạch%'
      )
    ORDER BY CASE WHEN lower(trim(name)) = 'kế hoạch' THEN 0 ELSE 1 END, order_index
    LIMIT 1;

    SELECT id INTO v_duyet FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND (
        lower(trim(name)) IN ('duyệt', 'kiểm tra đặt kính', 'kiểm tra và đặt kính.')
        OR lower(trim(name)) LIKE 'kiểm tra%'
      )
    ORDER BY CASE WHEN lower(trim(name)) = 'duyệt' THEN 0 ELSE 1 END, order_index
    LIMIT 1;

    SELECT id INTO v_gc FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND lower(trim(name)) IN ('gia công', 'sản xuất', 'chuẩn bị vật tư', 'chuẩn bị vật tư')
    ORDER BY CASE
      WHEN lower(trim(name)) = 'gia công' THEN 0
      WHEN lower(trim(name)) = 'sản xuất' THEN 1
      ELSE 2
    END, order_index
    LIMIT 1;

    SELECT id INTO v_ht FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND (
        lower(trim(name)) IN ('hoàn thiện', 'hoàn thành')
        OR lower(trim(name)) LIKE 'chờ giao hàng%'
      )
    ORDER BY CASE
      WHEN lower(trim(name)) = 'hoàn thiện' THEN 0
      WHEN lower(trim(name)) = 'hoàn thành' THEN 1
      ELSE 2
    END, order_index
    LIMIT 1;

    IF v_tiep IS NULL OR v_kh IS NULL OR v_duyet IS NULL OR v_gc IS NULL OR v_ht IS NULL THEN
      RAISE NOTICE '589: thiếu cột % (tiep=% kh=% duyet=% gc=% ht=%)',
        r_type.n, v_tiep, v_kh, v_duyet, v_gc, v_ht;
      CONTINUE;
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
    SET name = 'Gia công', color = '#EA580C', icon = '🏭', order_index = 4,
        is_active = true, crm_sync_type = 'production', deadline_group = 'cabinet',
        is_handover_to_logistics = false
    WHERE id = v_gc;

    UPDATE production_pipeline_stages
    SET name = 'Hoàn thiện', color = '#16A34A', icon = '✅', order_index = 5,
        is_active = true, crm_sync_type = 'production', deadline_group = 'finishing',
        is_handover_to_logistics = true, bucket_slug = NULL
    WHERE id = v_ht;

    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_old
    FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND id <> v_gc
      AND lower(trim(name)) IN (
        'chuẩn bị vật tư', 'phát vật tư', 'sản xuất'
      )
      AND id NOT IN (v_tiep, v_kh, v_duyet, v_ht);
    PERFORM _hcb_589_merge_sx_stages(v_gc, v_old);

    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_old
    FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND id <> v_ht
      AND (
        lower(trim(name)) IN ('hoàn thành', 'chờ giao hàng', 'vệ sinh đóng gói')
      )
      AND id NOT IN (v_tiep, v_kh, v_duyet, v_gc);
    PERFORM _hcb_589_merge_sx_stages(v_ht, v_old);

    UPDATE production_pipeline_stages
    SET workshop_type_id = v_congno,
        is_handover_to_logistics = false,
        deadline_group = NULL,
        crm_sync_type = 'production'
    WHERE company_id = v_hcb
      AND workshop_type_id = v_type
      AND (
        lower(name) LIKE '%công nợ%'
        OR lower(trim(name)) IN ('thu tiền', 'đợi thanh toán', 'nợ quá hạn', 'nợ quá hạn không thu tiền được')
      );

    UPDATE production_pipeline_stages
    SET name = 'Hủy', order_index = 90, is_active = true, deadline_group = NULL,
        is_handover_to_logistics = false
    WHERE company_id = v_hcb AND workshop_type_id = v_type
      AND lower(trim(name)) = 'hủy';

    PERFORM _hcb_589_ensure_gia_cong_tpl(v_hcb, v_type, v_gc);
  END LOOP;

  -- Đánh lại thứ tự cột Công nợ (giữ 4 cột gốc, thêm nợ quá hạn / đợi TT phía sau)
  WITH ordered AS (
    SELECT id, row_number() OVER (
      ORDER BY
        CASE
          WHEN lower(name) LIKE '%đã tính%' THEN 1
          WHEN lower(name) LIKE '%đối chiếu%' OR lower(name) LIKE '%đôi chiếu%' THEN 2
          WHEN lower(name) LIKE '%đã chốt%' THEN 3
          WHEN lower(name) LIKE '%thanh toán%' THEN 4
          WHEN lower(name) LIKE '%nợ quá hạn%' THEN 5
          ELSE 10
        END,
        order_index, name
    ) AS rn
    FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_congno
  )
  UPDATE production_pipeline_stages p
  SET order_index = o.rn
  FROM ordered o
  WHERE p.id = o.id;
END $$;

DROP FUNCTION IF EXISTS _hcb_589_ensure_gia_cong_tpl(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS _hcb_589_merge_sx_stages(UUID, UUID[]);
