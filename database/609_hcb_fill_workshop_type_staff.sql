-- 609: HCB — bổ sung đủ NV mặc định phân loại vào đội SX + tab Thành viên
-- (các đơn tạo sau 11/09 chỉ còn phụ trách chính). Idempotent, không đổi is_primary hiện có.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
  n_staff INT := 0;
  n_members INT := 0;
BEGIN
  SELECT id INTO v_hcb
  FROM companies
  WHERE id = '18c2563f-3495-498d-8199-23200c9f420e'
     OR short_name ILIKE 'HCB'
     OR name ILIKE '%Hucabi%'
  ORDER BY CASE WHEN id = '18c2563f-3495-498d-8199-23200c9f420e' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_hcb IS NULL THEN
    RAISE NOTICE '609: Không tìm thấy công ty HCB — bỏ qua.';
    RETURN;
  END IF;

  INSERT INTO project_production_staff (project_id, user_id, order_index, is_primary)
  SELECT p.id,
         d.user_id,
         COALESCE((
           SELECT MAX(s.order_index) FROM project_production_staff s WHERE s.project_id = p.id
         ), -1) + 1 + d.order_index,
         false
  FROM projects p
  JOIN production_workshop_type_default_staff d
    ON d.production_company_id = p.company_id
   AND d.workshop_type_id = p.workshop_type_id
  WHERE p.company_id = v_hcb
    AND p.workshop_type_id IS NOT NULL
    AND d.user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM project_production_staff s
      WHERE s.project_id = p.id AND s.user_id = d.user_id
    );
  GET DIAGNOSTICS n_staff = ROW_COUNT;

  INSERT INTO lead_members (lead_id, user_id, role)
  SELECT DISTINCT x.lead_id, d.user_id, 'member'
  FROM (
    SELECT l.id AS lead_id, p.id AS project_id, p.workshop_type_id, p.company_id
    FROM crm_leads l
    JOIN projects p ON p.id = l.project_id
    WHERE p.company_id = v_hcb AND l.type = 'deal' AND p.workshop_type_id IS NOT NULL
    UNION
    SELECT cdp.deal_id AS lead_id, p.id AS project_id, p.workshop_type_id, p.company_id
    FROM crm_deal_projects cdp
    JOIN projects p ON p.id = cdp.project_id
    WHERE p.company_id = v_hcb AND p.workshop_type_id IS NOT NULL
  ) x
  JOIN production_workshop_type_default_staff d
    ON d.production_company_id = x.company_id
   AND d.workshop_type_id = x.workshop_type_id
  JOIN users u ON u.id = d.user_id
  WHERE d.user_id IS NOT NULL
    AND u.is_active IS DISTINCT FROM false
    AND (
      lower(trim(COALESCE(u.role::text, ''))) IN (
        'production_admin', 'production_staff', 'production',
        'crm_production_admin', 'crm_production_staff',
        'logistics_admin', 'logistics', 'driver', 'installer', 'shipping'
      )
      OR lower(trim(COALESCE(u.drive_module, ''))) IN ('sx', 'production', 'vc', 'logistics')
      OR u.id = '646e364e-504d-4362-af1a-4f4694b0d05d'
      OR lower(trim(COALESCE(u.email, ''))) = 'trongthanh0800@gmail.com'
    )
    AND NOT EXISTS (
      SELECT 1 FROM lead_members lm
      WHERE lm.lead_id = x.lead_id AND lm.user_id = d.user_id
    );
  GET DIAGNOSTICS n_members = ROW_COUNT;

  RAISE NOTICE '609: HCB | staff mới=% | thành viên deal=%', n_staff, n_members;
END $$;
