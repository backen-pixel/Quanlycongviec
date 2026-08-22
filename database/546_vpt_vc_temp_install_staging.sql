-- 546: VPT — pipeline VC/LĐ + cột «lắp đặt tạm» (Dự án sắp tới)
--
-- VPT đã vào khối VC/LĐ (526) nhưng chưa có logistics_pipeline_stages theo company_id,
-- nên Sale lập kế hoạch SX & VC/LĐ không đưa được thẻ vào cột tạm.
-- Idempotent: chỉ seed khi chưa có stage theo công ty; nếu đã có thì chỉ đảm bảo cột tạm.

DO $$
DECLARE
  v_vpt UUID := '991dc79d-cbf5-49f9-a364-35227cb47635';
  v_stage_count INT;
  v_temp_id UUID;
BEGIN
  SELECT id INTO v_vpt
  FROM companies
  WHERE id = '991dc79d-cbf5-49f9-a364-35227cb47635'
     OR name ILIKE '%Vạn Phú Thành%'
     OR name ILIKE '%Van Phu Thanh%'
     OR short_name ILIKE 'VPT'
  ORDER BY CASE WHEN id = '991dc79d-cbf5-49f9-a364-35227cb47635' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_vpt IS NULL THEN
    RAISE NOTICE '546: Không tìm thấy công ty VPT — bỏ qua.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_stage_count
  FROM logistics_pipeline_stages
  WHERE company_id = v_vpt;

  -- Seed bộ cột chuẩn (global 6) + cột tạm đầu pipeline khi VPT chưa có stage riêng
  IF v_stage_count = 0 THEN
    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type,
      company_id, is_handover_to_install, is_temp_install_staging
    ) VALUES
      ('Dự án sắp tới', '#a21caf', '🔮', 0, true, NULL, NULL, v_vpt, false, true),
      ('Tiếp nhận', '#f97316', '📦', 1, true, 'delivery_pending', NULL, v_vpt, false, false),
      ('Đang giao', '#ea580c', '🚚', 2, true, 'delivery', 'delivery', v_vpt, false, false),
      ('Đã giao', '#c2410c', '📬', 3, true, 'delivered', 'delivery', v_vpt, false, false),
      ('Lắp đặt', '#d97706', '🔧', 4, true, 'installation', 'installation', v_vpt, false, false),
      ('Nghiệm thu - bàn giao', '#0d9488', '📋', 5, true, 'acceptance', 'customer_care', v_vpt, false, false),
      ('Hoàn thiện', '#16a34a', '✅', 6, true, 'completed', NULL, v_vpt, false, false);

    RAISE NOTICE '546: VPT=% — đã seed pipeline VC/LĐ (7 cột, có LĐ tạm).', v_vpt;
    RETURN;
  END IF;

  -- Đã có pipeline: tìm / tạo cột tạm
  SELECT id INTO v_temp_id
  FROM logistics_pipeline_stages
  WHERE company_id = v_vpt
    AND (
      is_temp_install_staging = true
      OR name ILIKE 'Dự án sắp tới'
      OR name ILIKE '%lắp đặt tạm%'
      OR name ILIKE '%lap dat tam%'
    )
  ORDER BY CASE WHEN is_temp_install_staging THEN 0 ELSE 1 END, order_index
  LIMIT 1;

  IF v_temp_id IS NULL THEN
    -- Đẩy các cột hiện có sang phải để cột tạm đứng đầu
    UPDATE logistics_pipeline_stages
    SET order_index = COALESCE(order_index, 0) + 1,
        updated_at = NOW()
    WHERE company_id = v_vpt;

    INSERT INTO logistics_pipeline_stages (
      name, color, icon, order_index, is_active, bucket_slug, crm_sync_type,
      company_id, is_handover_to_install, is_temp_install_staging
    ) VALUES (
      'Dự án sắp tới', '#a21caf', '🔮', 0, true, NULL, NULL, v_vpt, false, true
    )
    RETURNING id INTO v_temp_id;
  ELSE
    UPDATE logistics_pipeline_stages
    SET name = COALESCE(NULLIF(TRIM(name), ''), 'Dự án sắp tới'),
        is_temp_install_staging = true,
        is_active = true,
        is_handover_to_install = false,
        updated_at = NOW()
    WHERE id = v_temp_id;
  END IF;

  -- Mỗi công ty chỉ một cột tạm
  UPDATE logistics_pipeline_stages
  SET is_temp_install_staging = false,
      updated_at = NOW()
  WHERE company_id = v_vpt
    AND id <> v_temp_id
    AND is_temp_install_staging = true;

  RAISE NOTICE '546: VPT=% — cột LĐ tạm id=% đã sẵn sàng.', v_vpt, v_temp_id;
END $$;
