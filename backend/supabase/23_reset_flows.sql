-- ═══════════════════════════════════════════════════════════════
-- RESET: Xóa tất cả luồng + tạo 2 luồng mới hoàn chỉnh
-- ═══════════════════════════════════════════════════════════════

-- Xóa tất cả luồng cũ (cascade xóa steps + processes links)
DELETE FROM workflow_flows;

-- ═══ LUỒNG 1: TỦ BẾP TIÊU CHUẨN (8 Khối) ═══
DO $$
DECLARE
  v_flow_id UUID;
  v_step_id UUID;
  v_div_id UUID;
  v_comp_id UUID;
  v_proc RECORD;
  v_step_order INT := 0;
  v_proc_order INT;
  v_kw_groups TEXT[][] := ARRAY[
    ARRAY['kinh doanh','tư vấn','sales','consulting'],
    ARRAY['thiết kế','design'],
    ARRAY['báo giá','quotation'],
    ARRAY['hợp đồng','contract'],
    ARRAY['sản xuất','production'],
    ARRAY['vận chuyển','shipping','giao hàng'],
    ARRAY['lắp đặt','install'],
    ARRAY['cskh','chăm sóc','customer care']
  ];
  v_kw_group TEXT[];
  v_kw TEXT;
  v_found BOOLEAN;
BEGIN
  INSERT INTO workflow_flows (name,description,color,icon,is_default)
  VALUES ('Tủ bếp tiêu chuẩn','QT đầy đủ 8 Khối: KD → TK → BG → HĐ → SX → VC → LĐ → CSKH','#3B82F6','🏠',true)
  RETURNING id INTO v_flow_id;

  FOR i IN 1..array_length(v_kw_groups,1) LOOP
    v_kw_group := v_kw_groups[i];
    v_found := false;

    FOREACH v_kw IN ARRAY v_kw_group LOOP
      IF v_found THEN EXIT; END IF;
      SELECT eu.id INTO v_div_id FROM ecosystem_units eu
      JOIN ecosystem_levels el ON el.id = eu.level_id
      WHERE el.depth = 1 AND eu.is_active = true AND LOWER(eu.name) LIKE '%' || v_kw || '%'
      LIMIT 1;

      IF v_div_id IS NOT NULL THEN
        v_found := true;
        SELECT eu.id INTO v_comp_id FROM ecosystem_units eu
        WHERE eu.parent_id = v_div_id AND eu.level_id IN (SELECT id FROM ecosystem_levels WHERE depth = 2) AND eu.is_active = true
        ORDER BY eu.name LIMIT 1;

        v_step_order := v_step_order + 1;
        INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, order_index)
        VALUES (v_flow_id, v_div_id, v_comp_id, v_step_order)
        RETURNING id INTO v_step_id;

        IF v_comp_id IS NOT NULL THEN
          v_proc_order := 0;
          FOR v_proc IN SELECT id FROM company_processes WHERE company_unit_id = v_comp_id AND is_active = true ORDER BY order_index LOOP
            v_proc_order := v_proc_order + 1;
            INSERT INTO flow_step_processes (flow_step_id, process_id, order_index, is_required) VALUES (v_step_id, v_proc.id, v_proc_order, true);
          END LOOP;
        END IF;

        v_div_id := NULL; v_comp_id := NULL;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Luồng 1 (Chuẩn): % bước', v_step_order;
END $$;


-- ═══ LUỒNG 2: TỦ BẾP THƯƠNG MẠI (4 Khối rút gọn: TK → SX → VC → LĐ) ═══
DO $$
DECLARE
  v_flow_id UUID;
  v_step_id UUID;
  v_div_id UUID;
  v_comp_id UUID;
  v_proc RECORD;
  v_step_order INT := 0;
  v_proc_order INT;
  v_kw_groups TEXT[][] := ARRAY[
    ARRAY['thiết kế','design'],
    ARRAY['sản xuất','production'],
    ARRAY['vận chuyển','shipping','giao hàng'],
    ARRAY['lắp đặt','install']
  ];
  v_kw_group TEXT[];
  v_kw TEXT;
  v_found BOOLEAN;
BEGIN
  INSERT INTO workflow_flows (name,description,color,icon,is_default)
  VALUES ('Tủ bếp thương mại','4 bước rút gọn: TK → SX → VC → LĐ (bỏ KD, BG, HĐ, CSKH)','#10B981','🏢',false)
  RETURNING id INTO v_flow_id;

  FOR i IN 1..array_length(v_kw_groups,1) LOOP
    v_kw_group := v_kw_groups[i];
    v_found := false;

    FOREACH v_kw IN ARRAY v_kw_group LOOP
      IF v_found THEN EXIT; END IF;
      SELECT eu.id INTO v_div_id FROM ecosystem_units eu
      JOIN ecosystem_levels el ON el.id = eu.level_id
      WHERE el.depth = 1 AND eu.is_active = true AND LOWER(eu.name) LIKE '%' || v_kw || '%'
      LIMIT 1;

      IF v_div_id IS NOT NULL THEN
        v_found := true;
        SELECT eu.id INTO v_comp_id FROM ecosystem_units eu
        WHERE eu.parent_id = v_div_id AND eu.level_id IN (SELECT id FROM ecosystem_levels WHERE depth = 2) AND eu.is_active = true
        ORDER BY eu.name LIMIT 1;

        v_step_order := v_step_order + 1;
        INSERT INTO workflow_flow_steps (flow_id, division_unit_id, company_unit_id, order_index)
        VALUES (v_flow_id, v_div_id, v_comp_id, v_step_order)
        RETURNING id INTO v_step_id;

        IF v_comp_id IS NOT NULL THEN
          v_proc_order := 0;
          FOR v_proc IN SELECT id FROM company_processes WHERE company_unit_id = v_comp_id AND is_active = true ORDER BY order_index LOOP
            v_proc_order := v_proc_order + 1;
            INSERT INTO flow_step_processes (flow_step_id, process_id, order_index, is_required) VALUES (v_step_id, v_proc.id, v_proc_order, true);
          END LOOP;
        END IF;

        v_div_id := NULL; v_comp_id := NULL;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Luồng 2 (Thương mại): % bước', v_step_order;
END $$;
