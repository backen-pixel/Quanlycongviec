-- 617: Phúc Đạt — thêm Hoàng Thị Phượng Vân vào tab Thành viên
-- các deal đang ký HĐ trở đi (chưa hoàn thành / chưa thua).
-- Idempotent.

DO $$
DECLARE
  v_pd UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_van UUID := '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5';
  v_won INT := NULL;
  n_members INT := 0;
BEGIN
  SELECT id INTO v_pd
  FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR short_name ILIKE 'Phúc Đạt'
     OR name ILIKE '%Phúc Đạt%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_pd IS NULL THEN
    RAISE NOTICE '617: Không tìm thấy công ty Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_van
  FROM users
  WHERE id = '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5'
     OR lower(trim(email)) = 'phuongvanhoang1505@gmail.com'
  ORDER BY CASE WHEN id = '83c00741-0828-4e7f-b3bc-b2cfa8ccecc5' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_van IS NULL THEN
    RAISE NOTICE '617: Không tìm thấy NV Vân — bỏ qua.';
    RETURN;
  END IF;

  SELECT MAX(s.order_index) INTO v_won
  FROM crm_pipeline_stages s
  JOIN crm_pipelines p ON p.id = s.pipeline_id
  WHERE p.company_id = v_pd
    AND s.pipeline_type = 'deal'
    AND s.is_won = true
    AND s.is_active IS DISTINCT FROM false;

  IF v_won IS NULL THEN
    RAISE NOTICE '617: Không tìm thấy cột Đã ký hợp đồng Phúc Đạt — bỏ qua.';
    RETURN;
  END IF;

  INSERT INTO lead_members (lead_id, user_id, role)
  SELECT l.id, v_van, 'member'
  FROM crm_leads l
  JOIN crm_pipeline_stages st ON st.id = l.stage_id
  WHERE l.company_id = v_pd
    AND l.type = 'deal'
    AND COALESCE(st.is_lost, false) = false
    AND st.order_index >= v_won
    AND COALESCE(st.name, '') NOT ILIKE '%hoàn thành%'
    AND NOT EXISTS (
      SELECT 1 FROM lead_members m
      WHERE m.lead_id = l.id AND m.user_id = v_van
    );
  GET DIAGNOSTICS n_members = ROW_COUNT;

  RAISE NOTICE '617: Phúc Đạt Vân | thành viên deal mới=%', n_members;
END $$;
