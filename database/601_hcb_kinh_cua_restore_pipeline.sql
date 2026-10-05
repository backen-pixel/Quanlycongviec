-- 601: HCB — khôi phục pipeline Cánh kính (12+Hủy) và Cửa (11).
-- Kế hoạch 5 cột chưa triển khai. Không đụng Tủ bếp (đã 600).

CREATE OR REPLACE FUNCTION _hcb_601_ensure_stage(
  p_company UUID,
  p_type UUID,
  p_wf UUID,
  p_name TEXT,
  p_order INT,
  p_color TEXT,
  p_icon TEXT
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM production_pipeline_stages
  WHERE company_id = p_company
    AND workshop_type_id = p_type
    AND lower(trim(name)) = lower(trim(p_name))
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO production_pipeline_stages (
      name, color, icon, order_index, is_active, company_id, workshop_type_id,
      workflow_stage_id, crm_sync_type, is_handover_to_logistics, deadline_group
    ) VALUES (
      p_name, p_color, p_icon, p_order, true, p_company, p_type,
      p_wf, 'production', false, NULL
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE production_pipeline_stages
    SET name = p_name,
        color = p_color,
        icon = p_icon,
        order_index = p_order,
        is_active = true,
        crm_sync_type = 'production',
        is_handover_to_logistics = false,
        deadline_group = NULL
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  v_kinh UUID;
  v_cua UUID;
  v_congno UUID;
  v_wf UUID;
BEGIN
  SELECT id INTO v_kinh FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'cánh kính' LIMIT 1;
  SELECT id INTO v_cua FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'cửa' LIMIT 1;
  SELECT id INTO v_congno FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'công nợ' LIMIT 1;

  IF v_kinh IS NULL OR v_cua IS NULL THEN
    RAISE EXCEPTION '601: thiếu phân loại Cánh kính hoặc Cửa';
  END IF;

  SELECT workflow_stage_id INTO v_wf
  FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
  ORDER BY order_index LIMIT 1;

  -- ── Cánh kính: trả tên 5 cột ────────────────────────────────────────
  UPDATE production_pipeline_stages
  SET name = 'Tiếp Nhận', color = '#6366F1', icon = '📥',
      order_index = 1, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
    AND (lower(trim(name)) = 'tiếp nhận' OR lower(trim(name)) = 'tiếp nhận');

  UPDATE production_pipeline_stages
  SET name = 'Vẽ lên kế hoạch sản xuất', color = '#8B5CF6', icon = '📐',
      order_index = 2, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
    AND lower(trim(name)) = 'kế hoạch';

  UPDATE production_pipeline_stages
  SET name = 'Kiểm tra và đặt kính.', color = '#0EA5E9', icon = '🔍',
      order_index = 3, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
    AND lower(trim(name)) = 'duyệt';

  UPDATE production_pipeline_stages
  SET name = 'sản xuất', color = '#F59E0B', icon = '🏭',
      order_index = 6, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
    AND lower(trim(name)) = 'gia công';

  UPDATE production_pipeline_stages
  SET name = 'Hoàn thành', color = '#10B981', icon = '✅',
      order_index = 11, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
    AND lower(trim(name)) = 'hoàn thiện';

  UPDATE production_pipeline_stages
  SET name = 'Hủy', order_index = 90, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh
    AND lower(trim(name)) = 'hủy';

  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'Chuẩn bị Vật tư', 4, '#06B6D4', '📦');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'Phát vật tư', 5, '#14B8A6', '📤');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'vệ sinh đóng gói', 7, '#FB923C', '🧹');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'thu tiền', 8, '#16A34A', '💰');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'Chờ giao hàng', 9, '#64748B', '⏳');

  -- Đợi thanh toán (5 thẻ) + nợ quá hạn: kéo từ Công nợ về Cánh kính
  IF v_congno IS NOT NULL THEN
    UPDATE production_pipeline_stages
    SET workshop_type_id = v_kinh,
        name = 'Đợi thanh toán',
        color = '#D97706', icon = '💵',
        order_index = 10, is_active = true,
        deadline_group = NULL, is_handover_to_logistics = false
    WHERE company_id = v_hcb AND workshop_type_id = v_congno
      AND lower(trim(name)) = 'đợi thanh toán';

    UPDATE production_pipeline_stages
    SET workshop_type_id = v_kinh,
        name = 'Nợ quá hạn không thu tiền được',
        color = '#DC2626', icon = '⚠️',
        order_index = 12, is_active = true,
        deadline_group = NULL, is_handover_to_logistics = false
    WHERE company_id = v_hcb AND workshop_type_id = v_congno
      AND (
        lower(trim(name)) = 'nợ quá hạn'
        OR lower(trim(name)) = 'nợ quá hạn không thu tiền được'
      );
  END IF;

  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'Đợi thanh toán', 10, '#D97706', '💵');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_kinh, v_wf, 'Nợ quá hạn không thu tiền được', 12, '#DC2626', '⚠️');

  UPDATE projects p
  SET workshop_type_id = v_kinh, updated_at = NOW()
  WHERE p.company_id = v_hcb
    AND p.sx_kanban_column_id IN (
      SELECT id FROM production_pipeline_stages
      WHERE company_id = v_hcb AND workshop_type_id = v_kinh
        AND (
          lower(trim(name)) = 'đợi thanh toán'
          OR lower(trim(name)) LIKE 'nợ quá hạn%'
          OR lower(trim(name)) = 'thu tiền'
        )
    );

  -- Bộ mẫu Cánh kính: trả gói cũ
  UPDATE workshop_task_templates
  SET is_active = true, is_default = true, production_stage_id = NULL,
      name = CASE
        WHEN lower(trim(name)) = 'tiếp nhận' THEN 'Tiếp nhận và lên kế hoạch'
        ELSE name
      END
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh AND workshop_area = 'production'
    AND lower(trim(name)) IN (
      'tiếp nhận', 'tiếp nhận và lên kế hoạch',
      'chuẩn bị sản xuất',
      'sản xuất và chuẩn bị vận chuyển',
      'vận chuyển và thu tiền'
    );

  UPDATE workshop_task_templates
  SET is_active = false, is_default = false
  WHERE company_id = v_hcb AND workshop_type_id = v_kinh AND workshop_area = 'production'
    AND lower(trim(name)) IN ('kế hoạch', 'duyệt', 'hoàn thiện', 'gia công');

  -- ── Cửa: trả tên 5 cột (Hoàn thiện = Chờ giao hàng cũ) ──────────────
  UPDATE production_pipeline_stages
  SET name = 'Tiếp nhận', color = '#6366F1', icon = '📥',
      order_index = 1, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_cua
    AND lower(trim(name)) = 'tiếp nhận';

  UPDATE production_pipeline_stages
  SET name = 'Thiết kế và lập kế hoạch', color = '#8B5CF6', icon = '📐',
      order_index = 2, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_cua
    AND lower(trim(name)) = 'kế hoạch';

  UPDATE production_pipeline_stages
  SET name = 'Kiểm tra đặt kính', color = '#0EA5E9', icon = '🔍',
      order_index = 3, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_cua
    AND lower(trim(name)) = 'duyệt';

  UPDATE production_pipeline_stages
  SET name = 'Sản xuất', color = '#F59E0B', icon = '🏭',
      order_index = 6, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_cua
    AND lower(trim(name)) = 'gia công';

  UPDATE production_pipeline_stages
  SET name = 'Chờ giao hàng', color = '#64748B', icon = '⏳',
      order_index = 9, deadline_group = NULL, is_handover_to_logistics = false
  WHERE company_id = v_hcb AND workshop_type_id = v_cua
    AND lower(trim(name)) = 'hoàn thiện';

  PERFORM _hcb_601_ensure_stage(v_hcb, v_cua, v_wf, 'Chuẩn bị vật tư', 4, '#06B6D4', '📦');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_cua, v_wf, 'Phát vật tư', 5, '#14B8A6', '📤');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_cua, v_wf, 'Vệ sinh đóng gói', 7, '#FB923C', '🧹');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_cua, v_wf, 'Thu tiền', 8, '#16A34A', '💰');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_cua, v_wf, 'Đợi thanh toán', 10, '#D97706', '💵');
  PERFORM _hcb_601_ensure_stage(v_hcb, v_cua, v_wf, 'Nợ quá hạn', 11, '#DC2626', '⚠️');

  UPDATE workshop_task_templates
  SET is_active = false, is_default = false
  WHERE company_id = v_hcb AND workshop_type_id = v_cua AND workshop_area = 'production'
    AND lower(trim(name)) IN ('tiếp nhận', 'kế hoạch', 'duyệt', 'hoàn thiện', 'gia công');
END $$;

DROP FUNCTION IF EXISTS _hcb_601_ensure_stage(UUID, UUID, UUID, TEXT, INT, TEXT, TEXT);
