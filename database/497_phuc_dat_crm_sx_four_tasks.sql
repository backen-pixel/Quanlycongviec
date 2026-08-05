-- 497: Phúc Đạt — bộ nhiệm vụ CRM cột «Sản xuất.» chỉ còn 4 mục:
--   1. Đặt kính ốp
--   2. Đặt Đá
--   3. Đặt phụ kiện
--   4. Mô tả công trình
-- Bỏ khỏi bộ mẫu + xóa trên deal:
--   Bản vẽ sản xuất | Lịch lắp đặt | Bảng/Bản danh mục chuẩn bị vật tư
-- Sau đó backfill 4 nhiệm vụ cho mọi deal Phúc Đạt (không gồm Thua).

BEGIN;

DO $$
DECLARE
  v_phuc_dat UUID;
  v_stage_id UUID;
  v_template_id UUID;
  v_stage_slug TEXT;
  n_del_items INT := 0;
  n_ins_items INT := 0;
  n_del_tasks INT := 0;
  n_ins_tasks INT := 0;
  v_rowcount INT;
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
    RAISE NOTICE '497: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  -- Cột CRM «Sản xuất.» (sync_role = sx_production)
  SELECT s.id INTO v_stage_id
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE p.company_id = v_phuc_dat
    AND (
      s.sync_role = 'sx_production'
      OR lower(trim(s.name)) IN (lower('Sản xuất.'), lower('Sản xuất'))
    )
  ORDER BY CASE WHEN s.sync_role = 'sx_production' THEN 0 ELSE 1 END, s.order_index
  LIMIT 1;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION '497: Không tìm thấy cột CRM «Sản xuất.» của Phúc Đạt.';
  END IF;

  -- Khớp convention app: pl_{slug_name}_{8 ký tự đầu stage id}
  v_stage_slug := 'pl_san_xuat_' || substr(replace(v_stage_id::text, '-', ''), 1, 8);

  SELECT t.id INTO v_template_id
  FROM crm_task_templates t
  WHERE t.pipeline_stage_id = v_stage_id
    AND t.is_active = true
  ORDER BY t.order_index NULLS LAST, t.created_at
  LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO crm_task_templates (
      name, stage_slug, description, is_active, is_default, order_index,
      pipeline_type, pipeline_stage_id
    ) VALUES (
      'Sản xuất',
      v_stage_slug,
      'Bộ nhiệm vụ CRM mục Sản xuất — Phúc Đạt',
      true,
      true,
      0,
      'deal',
      v_stage_id
    )
    RETURNING id INTO v_template_id;
  ELSE
    -- Chuẩn hóa slug (bỏ deal_schedule legacy) để gen task mới đúng cột Sản xuất
    UPDATE crm_task_templates
    SET name = 'Sản xuất',
        stage_slug = v_stage_slug,
        is_active = true,
        pipeline_type = COALESCE(pipeline_type, 'deal')
    WHERE id = v_template_id;
  END IF;

  -- 1) Xóa mục cũ khỏi bộ mẫu
  DELETE FROM crm_task_template_items i
  WHERE i.template_id = v_template_id
    AND lower(trim(i.title)) IN (
      lower('Bản vẽ sản xuất'),
      lower('Lịch lắp đặt'),
      lower('Bảng danh mục chuẩn bị vật tư'),
      lower('Bản danh mục chuẩn bị vật tư')
    );
  GET DIAGNOSTICS n_del_items = ROW_COUNT;

  -- 2) Đảm bảo 4 mục mới trên bộ mẫu (idempotent theo title)
  FOR r_item IN
    SELECT * FROM (VALUES
      ('Đặt kính ốp', 1),
      ('Đặt Đá', 2),
      ('Đặt phụ kiện', 3),
      ('Mô tả công trình', 4)
    ) AS x(title, order_index)
  LOOP
    IF EXISTS (
      SELECT 1 FROM crm_task_template_items i
      WHERE i.template_id = v_template_id
        AND lower(trim(i.title)) = lower(trim(r_item.title))
    ) THEN
      UPDATE crm_task_template_items
      SET title = r_item.title,
          order_index = r_item.order_index,
          priority = COALESCE(priority, 'medium'),
          deadline_days = 0
      WHERE template_id = v_template_id
        AND lower(trim(title)) = lower(trim(r_item.title));
    ELSE
      INSERT INTO crm_task_template_items (
        template_id, title, priority, deadline_days, order_index, checklist
      ) VALUES (
        v_template_id,
        r_item.title,
        'medium',
        0,
        r_item.order_index,
        '[]'::jsonb
      );
      n_ins_items := n_ins_items + 1;
    END IF;
  END LOOP;

  -- 3) Xóa nhiệm vụ cũ trên mọi deal Phúc Đạt
  DELETE FROM crm_tasks t
  USING crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = v_phuc_dat
    AND l.type = 'deal'
    AND lower(trim(t.title)) IN (
      lower('Bản vẽ sản xuất'),
      lower('Lịch lắp đặt'),
      lower('Bảng danh mục chuẩn bị vật tư'),
      lower('Bản danh mục chuẩn bị vật tư')
    );
  GET DIAGNOSTICS n_del_tasks = ROW_COUNT;

  -- 4) Backfill 4 nhiệm vụ CRM Sản xuất cho mọi deal (không Thua)
  FOR r_item IN
    SELECT * FROM (VALUES
      ('Đặt kính ốp', 1),
      ('Đặt Đá', 2),
      ('Đặt phụ kiện', 3),
      ('Mô tả công trình', 4)
    ) AS x(title, order_index)
  LOOP
    INSERT INTO crm_tasks (
      lead_id,
      title,
      description,
      status,
      priority,
      stage_slug,
      pipeline_stage_id,
      order_index,
      checklist,
      created_by,
      created_at,
      updated_at
    )
    SELECT
      l.id,
      r_item.title,
      'Nhiệm vụ CRM — mục Sản xuất (Phúc Đạt)',
      'pending',
      'medium',
      v_stage_slug,
      v_stage_id,
      r_item.order_index,
      '[]'::jsonb,
      COALESCE(l.assigned_to, l.created_by, l.lead_owner_id),
      NOW(),
      NOW()
    FROM crm_leads l
    LEFT JOIN crm_pipeline_stages s ON s.id = l.stage_id
    WHERE l.type = 'deal'
      AND l.company_id = v_phuc_dat
      AND COALESCE(s.is_lost, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM crm_tasks t
        WHERE t.lead_id = l.id
          AND lower(trim(t.title)) = lower(trim(r_item.title))
          AND (
            t.pipeline_stage_id = v_stage_id
            OR lower(trim(COALESCE(t.stage_slug, ''))) = lower(v_stage_slug)
            OR lower(trim(COALESCE(t.stage_slug, ''))) LIKE 'pl_san_xuat_%'
            OR lower(trim(COALESCE(t.stage_slug, ''))) IN (lower('Sản xuất.'), lower('Sản xuất'))
          )
      );

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    n_ins_tasks := n_ins_tasks + v_rowcount;
  END LOOP;

  RAISE NOTICE '497: Phúc Đạt=% stage=% template=% | del_items=% ins_items=% | del_tasks=% ins_tasks=%',
    v_phuc_dat, v_stage_id, v_template_id, n_del_items, n_ins_items, n_del_tasks, n_ins_tasks;
END $$;

COMMIT;
