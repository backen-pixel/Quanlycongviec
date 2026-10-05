-- 602: HCB Tủ bếp — đưa thẻ SX đúng tiến trình (status / ngày giao-lắp / bàn giao VC).
-- Không đụng cột công nợ (order ≥ 12). Không đụng Cánh kính / Cửa.
-- Ngày VN. Ngày giao = delivery_date, không có thì install_date.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  v_tubep UUID;
  v_kcs UUID;
  v_btp UUID;
  v_cbx UUID;
  v_mai UUID;
  v_giao UUID;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_n INT;
BEGIN
  SELECT id INTO v_tubep FROM workshop_project_types
  WHERE company_id = v_hcb AND lower(trim(name)) = 'tủ bếp' LIMIT 1;
  IF v_tubep IS NULL THEN
    RAISE EXCEPTION '602: không có Tủ bếp';
  END IF;

  SELECT id INTO v_kcs FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND name ILIKE '%KCS%' LIMIT 1;
  SELECT id INTO v_btp FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND lower(trim(name)) = 'ban thành phẩm' LIMIT 1;
  SELECT id INTO v_cbx FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND name ILIKE '%đã chuẩn bị xong%' LIMIT 1;
  SELECT id INTO v_mai FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND name ILIKE '%mai giao%' LIMIT 1;
  SELECT id INTO v_giao FROM production_pipeline_stages
  WHERE company_id = v_hcb AND workshop_type_id = v_tubep AND name ILIKE '%đã giao%' LIMIT 1;

  IF v_kcs IS NULL OR v_btp IS NULL OR v_cbx IS NULL OR v_mai IS NULL OR v_giao IS NULL THEN
    RAISE EXCEPTION '602: thiếu cột (kcs=% btp=% cbx=% mai=% giao=%)',
      v_kcs, v_btp, v_cbx, v_mai, v_giao;
  END IF;

  CREATE TEMP TABLE _hcb_602_move (id UUID PRIMARY KEY, dest UUID NOT NULL);

  INSERT INTO _hcb_602_move (id, dest)
  SELECT p.id,
    CASE
      WHEN p.status::text = 'installing'
        OR COALESCE(p.delivery_date::date, p.install_date::date) < v_today
        THEN v_giao
      WHEN p.status::text = 'shipping'
        AND COALESCE(p.delivery_date::date, p.install_date::date) = v_today + 1
        THEN v_mai
      WHEN p.status::text = 'shipping'
        OR COALESCE(p.vc_handover_status, '') IN ('scheduled', 'confirmed')
        OR p.logistics_company_id IS NOT NULL
        THEN v_cbx
      WHEN pps.order_index BETWEEN 1 AND 3
        AND COALESCE(p.delivery_date::date, p.install_date::date) <= v_today
        THEN v_btp
      WHEN pps.id = v_btp
        AND COALESCE(p.delivery_date::date, p.install_date::date) <= v_today
        THEN v_kcs
      ELSE p.sx_kanban_column_id
    END
  FROM projects p
  JOIN production_pipeline_stages pps ON pps.id = p.sx_kanban_column_id
  WHERE p.company_id = v_hcb
    AND pps.workshop_type_id = v_tubep
    AND pps.order_index BETWEEN 1 AND 11;

  DELETE FROM _hcb_602_move m
  USING projects p
  WHERE m.id = p.id AND m.dest = p.sx_kanban_column_id;

  UPDATE projects p
  SET sx_kanban_column_id = m.dest, updated_at = NOW()
  FROM _hcb_602_move m
  WHERE p.id = m.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE crm_leads l
  SET sx_pipeline_stage_id = m.dest, updated_at = NOW()
  FROM _hcb_602_move m
  WHERE l.project_id = m.id AND l.type = 'deal';

  RAISE NOTICE '602: đã chuyển % dự án Tủ bếp', v_n;
  DROP TABLE _hcb_602_move;
END $$;
