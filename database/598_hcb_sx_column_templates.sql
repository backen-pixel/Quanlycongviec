-- HCB: bộ mẫu nhiệm vụ theo 5 cột SX (không còn gói mặc định «Tiếp nhận và lên kế hoạch» rời cột).
-- Idempotent. Không đụng Công nợ / VC.

CREATE OR REPLACE FUNCTION _hcb_598_ensure_tpl(
  p_company UUID,
  p_type UUID,
  p_stage UUID,
  p_name TEXT,
  p_order INT,
  p_default BOOLEAN,
  p_desc TEXT
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM workshop_task_templates
  WHERE company_id = p_company
    AND workshop_area = 'production'
    AND workshop_type_id = p_type
    AND production_stage_id = p_stage
  ORDER BY created_at
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, workshop_type_id,
      production_stage_id, is_active, is_default, order_index
    ) VALUES (
      p_name, 'production', p_desc, p_company, p_type, p_stage, true, p_default, p_order
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE workshop_task_templates
    SET name = p_name,
        description = p_desc,
        is_active = true,
        is_default = p_default,
        order_index = p_order,
        workshop_type_id = p_type
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION _hcb_598_ensure_item(
  p_tpl UUID,
  p_title TEXT,
  p_order INT,
  p_desc TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM workshop_task_template_items
    WHERE template_id = p_tpl AND lower(trim(title)) = lower(trim(p_title))
  ) THEN
    UPDATE workshop_task_template_items
    SET order_index = p_order,
        blocks_stage_advance = true,
        description = COALESCE(NULLIF(trim(description), ''), NULLIF(trim(p_desc), ''), description)
    WHERE template_id = p_tpl AND lower(trim(title)) = lower(trim(p_title));
  ELSE
    INSERT INTO workshop_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance
    ) VALUES (
      p_tpl, p_title, COALESCE(p_desc, p_title), 'medium', 0, p_order, '[]'::jsonb, true
    );
  END IF;
EXCEPTION WHEN undefined_column THEN
  IF EXISTS (
    SELECT 1 FROM workshop_task_template_items
    WHERE template_id = p_tpl AND lower(trim(title)) = lower(trim(p_title))
  ) THEN
    UPDATE workshop_task_template_items
    SET order_index = p_order
    WHERE template_id = p_tpl AND lower(trim(title)) = lower(trim(p_title));
  ELSE
    INSERT INTO workshop_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist
    ) VALUES (
      p_tpl, p_title, COALESCE(p_desc, p_title), 'medium', 0, p_order, '[]'::jsonb
    );
  END IF;
END;
$$;

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  rec RECORD;
  v_tn UUID;
  v_kh UUID;
  v_duyet UUID;
  v_ht UUID;
BEGIN
  UPDATE workshop_task_templates
  SET is_default = false, is_active = false
  WHERE company_id = v_hcb
    AND workshop_area = 'production'
    AND production_stage_id IS NULL
    AND lower(trim(name)) IN (
      'chuẩn bị sản xuất',
      'chuẩn bị và vận chuyển',
      'công nợ và thu tiền',
      'sản xuất và chuẩn bị vận chuyển',
      'vận chuyển và thu tiền'
    );

  FOR rec IN
    SELECT wpt.id AS type_id, wpt.name AS type_name
    FROM workshop_project_types wpt
    WHERE wpt.company_id = v_hcb
      AND lower(trim(wpt.name)) IN ('tủ bếp', 'cánh kính', 'cửa')
  LOOP
    v_tn := NULL;
    v_kh := NULL;
    v_duyet := NULL;
    v_ht := NULL;
    SELECT id INTO v_tn FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = rec.type_id
      AND (lower(trim(name)) = 'tiếp nhận' OR name ILIKE 'tiếp nhận%')
    ORDER BY CASE WHEN lower(trim(name)) = 'tiếp nhận' THEN 0 ELSE 1 END, order_index LIMIT 1;
    SELECT id INTO v_kh FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = rec.type_id
      AND (lower(trim(name)) = 'kế hoạch' OR name ILIKE '%kế hoạch%')
    ORDER BY CASE WHEN lower(trim(name)) = 'kế hoạch' THEN 0 ELSE 1 END, order_index LIMIT 1;
    SELECT id INTO v_duyet FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = rec.type_id
      AND (lower(trim(name)) = 'duyệt' OR name ILIKE '%duyệt%')
    ORDER BY CASE WHEN lower(trim(name)) = 'duyệt' THEN 0 ELSE 1 END, order_index LIMIT 1;
    SELECT id INTO v_ht FROM production_pipeline_stages
    WHERE company_id = v_hcb AND workshop_type_id = rec.type_id
      AND (lower(trim(name)) = 'hoàn thiện' OR name ILIKE '%hoàn thiện%' OR name ILIKE '%kcs%')
    ORDER BY CASE WHEN lower(trim(name)) = 'hoàn thiện' THEN 0 ELSE 1 END, order_index LIMIT 1;

    IF v_tn IS NULL THEN CONTINUE; END IF;

    UPDATE workshop_task_templates
    SET production_stage_id = v_tn,
        name = 'Tiếp nhận',
        is_default = true,
        is_active = true,
        order_index = 1,
        description = 'HCB — Tiếp nhận đơn vào xưởng.'
    WHERE company_id = v_hcb
      AND workshop_type_id = rec.type_id
      AND workshop_area = 'production'
      AND production_stage_id IS NULL
      AND lower(trim(name)) LIKE 'tiếp nhận%';

    v_tn := _hcb_598_ensure_tpl(
      v_hcb, rec.type_id, v_tn, 'Tiếp nhận', 1, true,
      'HCB — Tiếp nhận đơn vào xưởng.'
    );
    PERFORM _hcb_598_ensure_item(v_tn, 'Tiếp nhận thông tin dự án', 1, 'Tiếp nhận thông tin / file đơn');
    PERFORM _hcb_598_ensure_item(v_tn, 'Chốt yêu cầu kỹ thuật ban đầu', 2, 'Chốt yêu cầu kỹ thuật');

    IF v_kh IS NOT NULL THEN
      v_kh := _hcb_598_ensure_tpl(
        v_hcb, rec.type_id, v_kh, 'Kế hoạch', 2, false,
        'HCB — Vẽ / lập kế hoạch tiến độ SX.'
      );
      PERFORM _hcb_598_ensure_item(v_kh, 'Dựng/duyệt bản vẽ', 1, 'Dựng hoặc duyệt bản vẽ sản xuất');
      PERFORM _hcb_598_ensure_item(v_kh, 'Lập kế hoạch tiến độ', 2, 'Lập kế hoạch tiến độ theo ngày lắp');
    END IF;

    IF v_duyet IS NOT NULL THEN
      v_duyet := _hcb_598_ensure_tpl(
        v_hcb, rec.type_id, v_duyet, 'Duyệt', 3, false,
        'HCB — Kiểm tra chéo trước gia công.'
      );
      PERFORM _hcb_598_ensure_item(v_duyet, 'Rà soát kỹ thuật chéo', 1, 'Rà soát kỹ thuật chéo');
      PERFORM _hcb_598_ensure_item(v_duyet, 'Phê duyệt trước sản xuất', 2, 'Phê duyệt trước gia công');
    END IF;

    IF v_ht IS NOT NULL THEN
      v_ht := _hcb_598_ensure_tpl(
        v_hcb, rec.type_id, v_ht, 'Hoàn thiện', 5, false,
        'HCB — KCS / vệ sinh trước bàn giao VC.'
      );
      PERFORM _hcb_598_ensure_item(v_ht, 'Kiểm tra KCS', 1, 'Kiểm tra KCS');
      PERFORM _hcb_598_ensure_item(v_ht, 'Vệ sinh sản phẩm', 2, 'Vệ sinh sản phẩm');
      PERFORM _hcb_598_ensure_item(v_ht, 'Nghiệm thu nội bộ', 3, 'Nghiệm thu nội bộ trước bàn giao');
    END IF;
  END LOOP;

  BEGIN
    UPDATE workshop_task_template_items i
    SET blocks_stage_advance = true
    FROM workshop_task_templates t
    WHERE i.template_id = t.id
      AND t.company_id = v_hcb
      AND t.workshop_area = 'production'
      AND t.production_stage_id IS NOT NULL;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
END $$;

DROP FUNCTION IF EXISTS _hcb_598_ensure_tpl(UUID, UUID, UUID, TEXT, INT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS _hcb_598_ensure_item(UUID, TEXT, INT, TEXT);
