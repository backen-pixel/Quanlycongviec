-- 126: Clone bộ nhiệm vụ mẫu CRM (Lead + Deal) từ **Phúc Đạt** sang **Bếp Vạn Phú Thành**
--
-- Cách nhận diện bộ mẫu "của Phúc Đạt": ít nhất một `crm_task_template_items.default_allowed_companies`
-- chứa UUID công ty Phúc Đạt (như khi bật phân quyền công ty trên từng mục trong UI CRM).
-- Bản sao: mỗi mục được gán `default_allowed_companies = [Vạn Phú Thành]`; `is_default = false` để tránh trùng mặc định.
--
-- Idempotent: nếu đã có template với mô tả chứa `[crm-clone-vpt-from-pd]` thì bỏ qua toàn bộ.
--
-- Chạy trên Supabase SQL Editor.

-- Giống database/38_template_item_visibility_defaults.sql — bắt buộc trước khi dùng default_* trên mục mẫu.
ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS default_allowed_companies JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_allowed_departments JSONB DEFAULT NULL;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS default_allowed_companies JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_allowed_departments JSONB DEFAULT NULL;

DO $$
DECLARE
  phuc_id UUID;
  vpt_id UUID;
  src RECORD;
  new_tpl_id UUID;
  n INT := 0;
BEGIN
  IF to_regclass('public.crm_task_templates') IS NULL THEN
    RAISE EXCEPTION '126: Thiếu bảng crm_task_templates.';
  END IF;

  SELECT id INTO phuc_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
     OR (name ILIKE '%Phúc%' AND name ILIKE '%Đạt%')
  ORDER BY name LIMIT 1;

  SELECT id INTO vpt_id FROM companies
  WHERE name ILIKE '%Bếp%Vạn%Phú%Thành%'
     OR name ILIKE '%Bếp Vạn Phú%'
     OR name ILIKE '%Vạn Phú%Thành%'
     OR name ILIKE '%Van Phu%Thanh%'
     OR (name ILIKE '%Vạn Phú%' AND name ILIKE '%Thành%')
     OR short_name ILIKE '%VPT%'
  ORDER BY name LIMIT 1;

  IF phuc_id IS NULL THEN
    RAISE EXCEPTION '126: Không tìm thấy công ty Phúc Đạt trong `companies`.';
  END IF;
  IF vpt_id IS NULL THEN
    RAISE EXCEPTION '126: Không tìm thấy công ty Bếp Vạn Phú Thành trong `companies`.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM crm_task_templates
    WHERE COALESCE(description, '') LIKE '%[crm-clone-vpt-from-pd]%'
  ) THEN
    RAISE NOTICE '126: Đã có bản ghi clone (marker [crm-clone-vpt-from-pd]) — bỏ qua.';
    RETURN;
  END IF;

  FOR src IN
    SELECT t.*
    FROM crm_task_templates t
    WHERE t.id IN (
        SELECT DISTINCT i.template_id
        FROM crm_task_template_items i
        WHERE i.default_allowed_companies IS NOT NULL
          AND i.default_allowed_companies @> jsonb_build_array(phuc_id::text)
      )
    ORDER BY t.order_index, t.name
  LOOP
    INSERT INTO crm_task_templates (
      name, stage_slug, description, is_active, is_default, order_index, pipeline_type
    )
    VALUES (
      src.name || ' (Bếp Vạn Phú Thành)',
      src.stage_slug,
      CASE
        WHEN src.description IS NULL OR trim(src.description) = ''
          THEN '[crm-clone-vpt-from-pd]'
        ELSE trim(src.description) || E'\n[crm-clone-vpt-from-pd]'
      END,
      COALESCE(src.is_active, true),
      false,
      src.order_index,
      COALESCE(src.pipeline_type, 'both')
    )
    RETURNING id INTO new_tpl_id;

    INSERT INTO crm_task_template_items (
      template_id, title, description, priority, deadline_days, order_index, checklist,
      default_allowed_companies, default_allowed_departments
    )
    SELECT
      new_tpl_id,
      i.title,
      i.description,
      COALESCE(i.priority, 'medium'),
      COALESCE(i.deadline_days, 0),
      i.order_index,
      COALESCE(i.checklist, '[]'::jsonb),
      jsonb_build_array(vpt_id::text),
      i.default_allowed_departments
    FROM crm_task_template_items i
    WHERE i.template_id = src.id
    ORDER BY i.order_index;

    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RAISE NOTICE
      '126: Không có bộ mẫu nào có mục gắn Phúc Đạt (default_allowed_companies). '
      'Trên CRM > Bộ nhiệm vụ mẫu, gắn công ty Phúc Đạt cho ít nhất một mục trong các bộ Lead/Deal, rồi chạy lại migration này.';
    RETURN;
  END IF;

  RAISE NOTICE '126: Đã clone % bộ mẫu CRM sang Bếp Vạn Phú Thành (company_id=%).', n, vpt_id;
END $$;
