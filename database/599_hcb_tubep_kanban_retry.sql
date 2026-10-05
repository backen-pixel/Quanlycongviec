-- 599: HCB Tủ bếp — thực sự gom 5 cột (588 bỏ qua vì không khớp tên «KT KCS…»).
-- Idempotent. Cánh kính / Cửa không đụng.

CREATE OR REPLACE FUNCTION _hcb_599_merge_sx_stages(p_keep UUID, p_olds UUID[])
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
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  v_tubep UUID;
  v_congno UUID;
  v_tiep UUID;
  v_kh UUID;
  v_duyet UUID;
  v_gc UUID;
  v_ht UUID;
  v_old UUID[];
BEGIN
  SELECT id INTO v_tubep
  FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp'
  LIMIT 1;
  IF v_tubep IS NULL THEN
    RAISE NOTICE '599: không có phân loại Tủ bếp';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND lower(trim(name)) = 'tiếp nhận'
  ) AND EXISTS (
    SELECT 1 FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND lower(trim(name)) = 'gia công'
  ) AND EXISTS (
    SELECT 1 FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND lower(trim(name)) = 'hoàn thiện'
  ) THEN
    RAISE NOTICE '599: Tủ bếp đã 5 cột — chỉ dọn cột thừa nếu còn.';
  END IF;

  SELECT id INTO v_congno
  FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'công nợ'
  LIMIT 1;
  IF v_congno IS NULL THEN
    INSERT INTO workshop_project_types (
      company_id, name, applies_to, order_index, is_active, description, updated_at
    ) VALUES (
      v_hcb, 'Công nợ', 'production', 90, true,
      'Nhánh thu công nợ sau giao — không dùng khi đặt xưởng / tạo dự án SX mới.',
      NOW()
    ) RETURNING id INTO v_congno;
  END IF;

  SELECT id INTO v_tiep FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (lower(trim(name)) = 'tiếp nhận' OR name ILIKE '%tiếp nhận%')
  ORDER BY CASE WHEN lower(trim(name)) = 'tiếp nhận' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  SELECT id INTO v_kh FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (lower(trim(name)) = 'kế hoạch' OR name ILIKE '%kế hoạch%')
  ORDER BY CASE WHEN lower(trim(name)) = 'kế hoạch' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  SELECT id INTO v_duyet FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (lower(trim(name)) = 'duyệt' OR name ILIKE '%kiểm tra chéo%' OR name ILIKE '%duyệt%')
  ORDER BY CASE WHEN lower(trim(name)) = 'duyệt' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  SELECT id INTO v_gc FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      lower(trim(name)) = 'gia công'
      OR name ILIKE '%ban thành phẩm%'
      OR name ILIKE '%bán thành phẩm%'
    )
  ORDER BY CASE WHEN lower(trim(name)) = 'gia công' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  SELECT id INTO v_ht FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND (
      lower(trim(name)) = 'hoàn thiện'
      OR name ILIKE '%kcs%'
    )
  ORDER BY CASE WHEN lower(trim(name)) = 'hoàn thiện' THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  IF v_tiep IS NULL OR v_kh IS NULL OR v_duyet IS NULL OR v_gc IS NULL OR v_ht IS NULL THEN
    RAISE EXCEPTION '599: Thiếu cột gốc Tủ bếp (tiep=%, kh=%, duyet=%, gc=%, ht=%)',
      v_tiep, v_kh, v_duyet, v_gc, v_ht;
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
    AND id NOT IN (v_tiep, v_kh, v_duyet, v_gc, v_ht)
    AND (
      name ILIKE '%thùng%'
      OR name ILIKE '%nhôm%'
      OR name ILIKE '%alu%'
      OR name ILIKE '%sơn%'
      OR name ILIKE '%cánh%'
      OR name ILIKE '%vật tư%'
      OR name ILIKE '%cắt%'
    );
  PERFORM _hcb_599_merge_sx_stages(v_gc, v_old);

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_old
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND id NOT IN (v_tiep, v_kh, v_duyet, v_gc, v_ht)
    AND (
      name ILIKE '%đã chuẩn bị xong%'
      OR name ILIKE '%mai giao%'
      OR name ILIKE '%đã giao%'
    );
  PERFORM _hcb_599_merge_sx_stages(v_ht, v_old);

  UPDATE production_pipeline_stages
  SET workshop_type_id = v_congno,
      is_handover_to_logistics = false,
      deadline_group = NULL,
      crm_sync_type = 'production'
  WHERE company_id = v_hcb
    AND workshop_type_id = v_tubep
    AND id NOT IN (v_tiep, v_kh, v_duyet, v_gc, v_ht)
    AND (
      name ILIKE '%công nợ%'
      OR name ILIKE '%thu tiền%'
      OR name ILIKE '%kế toán%'
    );

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_old
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep
    AND id NOT IN (v_tiep, v_kh, v_duyet, v_gc, v_ht);
  PERFORM _hcb_599_merge_sx_stages(v_gc, v_old);
END $$;

DROP FUNCTION IF EXISTS _hcb_599_merge_sx_stages(UUID, UUID[]);
