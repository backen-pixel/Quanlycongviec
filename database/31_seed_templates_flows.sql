-- ═══════════════════════════════════════════════════════════════════════
-- SEED: Bộ mẫu nhiệm vụ + Luồng cho 3 khối
-- Chạy SAU khi đã seed quy trình (30_reset_process_templates.sql)
-- Chạy trên Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. TẠO BỘ MẪU NHIỆM VỤ (copy từ quy trình) ───
DO $$
DECLARE
  cty RECORD;
  proc RECORD;
  ptask RECORD;
  pcheck RECORD;
  set_id UUID;
  new_task_id UUID;
  stage_id_val UUID;
  stage_slug_val TEXT;
BEGIN
  -- Lặp từng công ty có quy trình
  FOR cty IN
    SELECT DISTINCT cp.company_unit_id, eu.name as cty_name, parent.name as khoi_name
    FROM company_processes cp
    JOIN ecosystem_units eu ON eu.id = cp.company_unit_id
    JOIN ecosystem_units parent ON parent.id = eu.parent_id
    WHERE cp.is_active = true
  LOOP
    -- Tạo 1 bộ mẫu cho mỗi công ty
    INSERT INTO company_template_sets (id, name, unit_id, project_type, is_default, is_active)
    VALUES (
      gen_random_uuid(),
      'Bộ mẫu ' || cty.cty_name,
      cty.company_unit_id,
      'tubep',
      true,
      true
    ) RETURNING id INTO set_id;

    -- Lặp từng quy trình của công ty đó
    FOR proc IN
      SELECT * FROM company_processes
      WHERE company_unit_id = cty.company_unit_id AND is_active = true
      ORDER BY order_index
    LOOP
      -- Map process name → stage slug
      stage_slug_val := CASE
        WHEN proc.name ILIKE '%tư vấn%' OR proc.name ILIKE '%tiếp nhận%' THEN 'consulting'
        WHEN proc.name ILIKE '%thiết kế%' THEN 'design'
        WHEN proc.name ILIKE '%báo giá%' OR proc.name ILIKE '%hợp đồng%' THEN 'quotation'
        WHEN proc.name ILIKE '%sản xuất%' THEN 'production'
        WHEN proc.name ILIKE '%vận chuyển%' OR proc.name ILIKE '%lắp đặt%' THEN 'delivery'
        WHEN proc.name ILIKE '%bảo hành%' OR proc.name ILIKE '%cskh%' OR proc.name ILIKE '%chăm sóc%' THEN 'customer-care'
        ELSE 'consulting'
      END;

      -- Lấy stage_id từ slug
      SELECT id INTO stage_id_val FROM workflow_stages WHERE slug = stage_slug_val LIMIT 1;
      -- Fallback nếu không có
      IF stage_id_val IS NULL THEN
        SELECT id INTO stage_id_val FROM workflow_stages ORDER BY order_index LIMIT 1;
      END IF;

      -- Copy tasks từ process → template
      FOR ptask IN
        SELECT * FROM company_process_tasks
        WHERE process_id = proc.id ORDER BY order_index
      LOOP
        INSERT INTO company_template_tasks (id, template_set_id, stage_id, title, description, priority, order_index, deadline_days,
          default_department_id, default_team_id, default_assignee_id, estimated_hours)
        VALUES (
          gen_random_uuid(), set_id, stage_id_val,
          ptask.title, ptask.description, ptask.priority,
          ptask.order_index + (proc.order_index * 100), -- offset theo QT
          ptask.deadline_days,
          ptask.default_department_id, ptask.default_team_id, ptask.default_assignee_id,
          ptask.estimated_hours
        ) RETURNING id INTO new_task_id;

        -- Copy checklists
        FOR pcheck IN
          SELECT * FROM company_process_checklists
          WHERE task_id = ptask.id ORDER BY order_index
        LOOP
          INSERT INTO company_template_checklists (template_task_id, title, order_index, require_file, require_note)
          VALUES (new_task_id, pcheck.title, pcheck.order_index, COALESCE(pcheck.require_file, false), COALESCE(pcheck.require_note, false));
        END LOOP;
      END LOOP;
    END LOOP;

    RAISE NOTICE 'Tạo bộ mẫu cho: %', cty.cty_name;
  END LOOP;
END $$;

-- ─── 2. TẠO LUỒNG CÔNG VIỆC ───
DO $$
DECLARE
  flow_id UUID;
  khoi RECORD;
  cty RECORD;
  tpl_set RECORD;
  step_order INT;
BEGIN
  -- ════════════════════════════════════════
  -- LUỒNG 1: Luồng Tủ Bếp Tiêu Chuẩn
  -- ════════════════════════════════════════
  INSERT INTO workflow_flows (id, name, description, color, icon, is_default, is_active)
  VALUES (gen_random_uuid(), 'Luồng Tủ Bếp Tiêu Chuẩn', 'Luồng đầy đủ: KD → SX → VC&LĐ', '#6366F1', '🔄', true, true)
  RETURNING id INTO flow_id;

  step_order := 0;

  -- Bước 1: Khối Kinh Doanh
  FOR khoi IN
    SELECT id, name FROM ecosystem_units
    WHERE parent_id IS NULL AND name ILIKE '%Kinh Doanh%' AND is_active = true
  LOOP
    -- Lấy công ty đầu tiên trong khối
    SELECT eu.id INTO cty FROM ecosystem_units eu
    WHERE eu.parent_id = khoi.id AND eu.is_active = true
    ORDER BY eu.order_index LIMIT 1;

    -- Lấy bộ mẫu của công ty đó
    SELECT id INTO tpl_set FROM company_template_sets
    WHERE unit_id = cty.id AND is_active = true
    ORDER BY is_default DESC LIMIT 1;

    step_order := step_order + 1;
    INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, template_set_id, order_index, description)
    VALUES (flow_id, khoi.id, cty.id, tpl_set.id, step_order, 'Tư vấn → Thiết kế → Báo giá → Hợp đồng');
  END LOOP;

  -- Bước 2: Khối Sản Xuất
  FOR khoi IN
    SELECT id, name FROM ecosystem_units
    WHERE parent_id IS NULL AND name ILIKE '%Sản Xuất%' AND is_active = true
  LOOP
    SELECT eu.id INTO cty FROM ecosystem_units eu
    WHERE eu.parent_id = khoi.id AND eu.is_active = true
    ORDER BY eu.order_index LIMIT 1;

    SELECT id INTO tpl_set FROM company_template_sets
    WHERE unit_id = cty.id AND is_active = true
    ORDER BY is_default DESC LIMIT 1;

    step_order := step_order + 1;
    INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, template_set_id, order_index, description)
    VALUES (flow_id, khoi.id, cty.id, tpl_set.id, step_order, 'Sản xuất tủ bếp');
  END LOOP;

  -- Bước 3: Khối Vận Chuyển & Lắp Đặt
  FOR khoi IN
    SELECT id, name FROM ecosystem_units
    WHERE parent_id IS NULL
    AND (name ILIKE '%Vận Chuyển%' OR name ILIKE '%Lắp Đặt%' OR name ILIKE '%VCLD%')
    AND is_active = true
  LOOP
    SELECT eu.id INTO cty FROM ecosystem_units eu
    WHERE eu.parent_id = khoi.id AND eu.is_active = true
    ORDER BY eu.order_index LIMIT 1;

    SELECT id INTO tpl_set FROM company_template_sets
    WHERE unit_id = cty.id AND is_active = true
    ORDER BY is_default DESC LIMIT 1;

    step_order := step_order + 1;
    INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, template_set_id, order_index, description)
    VALUES (flow_id, khoi.id, cty.id, tpl_set.id, step_order, 'Vận chuyển & Lắp đặt + CSKH');
  END LOOP;

  RAISE NOTICE 'Tạo luồng: Tủ Bếp Tiêu Chuẩn (% bước)', step_order;
END $$;
