-- 576: Trương Trọng Thành (trongthanh0800@gmail.com)
-- Thêm vào mọi dự án Phúc Đạt + VPT (SX/VC của công ty, hoặc deal CRM của công ty
-- dù SX ở xưởng khác) — project_production_staff + lead_members.
-- NV mặc định phân loại xưởng. Không ghi đè phụ trách VC/LĐ đã gán. Idempotent.

DO $$
DECLARE
  v_user UUID := '646e364e-504d-4362-af1a-4f4694b0d05d';
  v_pd UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_vpt UUID := '991dc79d-cbf5-49f9-a364-35227cb47635';
  n_staff INT := 0;
  n_members INT := 0;
  n_defaults INT := 0;
  n_logistics INT := 0;
  n_installer INT := 0;
BEGIN
  SELECT id INTO v_user
  FROM users
  WHERE id = '646e364e-504d-4362-af1a-4f4694b0d05d'
     OR lower(trim(email)) = 'trongthanh0800@gmail.com'
     OR full_name ILIKE 'Trương Trọng Thành'
  ORDER BY CASE
    WHEN id = '646e364e-504d-4362-af1a-4f4694b0d05d' THEN 0
    WHEN lower(trim(email)) = 'trongthanh0800@gmail.com' THEN 1
    ELSE 2
  END
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '576: Không tìm thấy user Trương Trọng Thành — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_pd FROM companies
  WHERE id = '29677f68-967e-4256-92fd-492bb580e888'
     OR short_name ILIKE 'Phúc Đạt'
     OR name ILIKE '%Nhôm Kính Phúc Đạt%'
  ORDER BY CASE WHEN id = '29677f68-967e-4256-92fd-492bb580e888' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO v_vpt FROM companies
  WHERE id = '991dc79d-cbf5-49f9-a364-35227cb47635'
     OR short_name ILIKE 'VPT'
     OR name ILIKE '%Vạn Phú Thành%'
  ORDER BY CASE WHEN id = '991dc79d-cbf5-49f9-a364-35227cb47635' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_pd IS NULL AND v_vpt IS NULL THEN
    RAISE NOTICE '576: Không tìm thấy Phúc Đạt / VPT — bỏ qua.';
    RETURN;
  END IF;

  UPDATE users
  SET is_active = true, updated_at = NOW()
  WHERE id = v_user AND is_active IS DISTINCT FROM true;

  CREATE TEMP TABLE tmp_576_projects ON COMMIT DROP AS
  SELECT DISTINCT p.id
  FROM projects p
  WHERE (v_pd IS NOT NULL AND (p.company_id = v_pd OR p.logistics_company_id = v_pd))
     OR (v_vpt IS NOT NULL AND (p.company_id = v_vpt OR p.logistics_company_id = v_vpt))
  UNION
  SELECT DISTINCT l.project_id
  FROM crm_leads l
  WHERE l.type = 'deal' AND l.project_id IS NOT NULL
    AND (
      (v_pd IS NOT NULL AND l.company_id = v_pd)
      OR (v_vpt IS NOT NULL AND l.company_id = v_vpt)
    )
  UNION
  SELECT DISTINCT cdp.project_id
  FROM crm_deal_projects cdp
  JOIN crm_leads l ON l.id = cdp.deal_id
  WHERE cdp.project_id IS NOT NULL
    AND (
      (v_pd IS NOT NULL AND l.company_id = v_pd)
      OR (v_vpt IS NOT NULL AND l.company_id = v_vpt)
    );

  INSERT INTO project_production_staff (project_id, user_id, order_index, is_primary)
  SELECT t.id,
         v_user,
         COALESCE((
           SELECT MAX(s.order_index) FROM project_production_staff s WHERE s.project_id = t.id
         ), 0) + 1,
         false
  FROM tmp_576_projects t
  WHERE NOT EXISTS (
    SELECT 1 FROM project_production_staff s
    WHERE s.project_id = t.id AND s.user_id = v_user
  );
  GET DIAGNOSTICS n_staff = ROW_COUNT;

  INSERT INTO lead_members (lead_id, user_id, role)
  SELECT DISTINCT x.lead_id, v_user, 'member'
  FROM (
    SELECT l.id AS lead_id
    FROM crm_leads l
    WHERE l.type = 'deal'
      AND (
        (v_pd IS NOT NULL AND l.company_id = v_pd)
        OR (v_vpt IS NOT NULL AND l.company_id = v_vpt)
      )
    UNION
    SELECT l.id AS lead_id
    FROM crm_leads l
    JOIN tmp_576_projects t ON t.id = l.project_id
    WHERE l.type = 'deal'
    UNION
    SELECT cdp.deal_id AS lead_id
    FROM crm_deal_projects cdp
    JOIN tmp_576_projects t ON t.id = cdp.project_id
  ) x
  WHERE x.lead_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM lead_members lm
      WHERE lm.lead_id = x.lead_id AND lm.user_id = v_user
    );
  GET DIAGNOSTICS n_members = ROW_COUNT;

  INSERT INTO production_workshop_type_default_staff (
    production_company_id, workshop_type_id, user_id, order_index, is_primary
  )
  SELECT wpt.company_id, wpt.id, v_user, COALESCE((
    SELECT MAX(d.order_index)
    FROM production_workshop_type_default_staff d
    WHERE d.production_company_id = wpt.company_id AND d.workshop_type_id = wpt.id
  ), 0) + 1, false
  FROM workshop_project_types wpt
  WHERE wpt.company_id IN (v_pd, v_vpt)
    AND wpt.company_id IS NOT NULL
    AND wpt.is_active IS DISTINCT FROM false
    AND NOT EXISTS (
      SELECT 1 FROM production_workshop_type_default_staff d
      WHERE d.production_company_id = wpt.company_id
        AND d.workshop_type_id = wpt.id
        AND d.user_id = v_user
    );
  GET DIAGNOSTICS n_defaults = ROW_COUNT;

  IF v_pd IS NOT NULL THEN
    INSERT INTO logistics_handover_settings (
      logistics_company_id, responsible_user_id, installer_user_id, updated_at
    )
    VALUES (v_pd, v_user, v_user, NOW())
    ON CONFLICT (logistics_company_id) DO UPDATE SET
      responsible_user_id = COALESCE(logistics_handover_settings.responsible_user_id, EXCLUDED.responsible_user_id),
      installer_user_id = COALESCE(logistics_handover_settings.installer_user_id, EXCLUDED.installer_user_id),
      updated_at = NOW();
  END IF;

  IF v_vpt IS NOT NULL THEN
    INSERT INTO logistics_handover_settings (
      logistics_company_id, responsible_user_id, installer_user_id, updated_at
    )
    VALUES (v_vpt, v_user, v_user, NOW())
    ON CONFLICT (logistics_company_id) DO UPDATE SET
      responsible_user_id = COALESCE(logistics_handover_settings.responsible_user_id, EXCLUDED.responsible_user_id),
      installer_user_id = COALESCE(logistics_handover_settings.installer_user_id, EXCLUDED.installer_user_id),
      updated_at = NOW();
  END IF;

  UPDATE projects p
  SET logistics_person_id = v_user, updated_at = NOW()
  WHERE p.id IN (SELECT id FROM tmp_576_projects)
    AND p.logistics_person_id IS NULL;
  GET DIAGNOSTICS n_logistics = ROW_COUNT;

  UPDATE projects p
  SET installer_person_id = v_user, updated_at = NOW()
  WHERE p.id IN (SELECT id FROM tmp_576_projects)
    AND p.installer_person_id IS NULL;
  GET DIAGNOSTICS n_installer = ROW_COUNT;

  RAISE NOTICE '576: Thành PD+VPT | staff mới=% | thành viên deal=% | mặc định phân loại=% | VC trống=% | LĐ trống=%',
    n_staff, n_members, n_defaults, n_logistics, n_installer;
END $$;
