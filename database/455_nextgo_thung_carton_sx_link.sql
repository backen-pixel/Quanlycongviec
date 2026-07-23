-- 455: NextGo — phân loại SX «Thùng carton» + gắn loại CRM Thùng carton → SX NextGo.

DO $$
DECLARE
  v_nextgo UUID := '87479a83-1145-43b7-b090-3e40812cb5a9';
  v_lt UUID := '304c1885-3371-424d-8188-bda3c2eb29c8';
  v_wt UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = v_nextgo) THEN
    RAISE NOTICE '455: NextGo không tồn tại — bỏ qua.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM crm_lead_types WHERE id = v_lt AND company_id = v_nextgo) THEN
    RAISE NOTICE '455: Loại CRM Thùng carton không tồn tại — bỏ qua.';
    RETURN;
  END IF;

  SELECT id INTO v_wt
  FROM workshop_project_types
  WHERE company_id = v_nextgo
    AND name ILIKE 'Thùng carton'
  LIMIT 1;

  IF v_wt IS NULL THEN
    INSERT INTO workshop_project_types (company_id, name, applies_to, order_index, is_active)
    VALUES (v_nextgo, 'Thùng carton', 'production', 60, true)
    RETURNING id INTO v_wt;
  ELSE
    UPDATE workshop_project_types
    SET applies_to = 'production', is_active = true, updated_at = now()
    WHERE id = v_wt;
  END IF;

  UPDATE crm_lead_types
  SET
    default_production_company_id = v_nextgo,
    default_workshop_type_id = v_wt
  WHERE id = v_lt;

  INSERT INTO crm_lead_type_production_links (
    lead_type_id, production_company_id, workshop_type_id, is_primary, order_index
  )
  VALUES (v_lt, v_nextgo, v_wt, true, 0)
  ON CONFLICT (lead_type_id, production_company_id, workshop_type_id) DO UPDATE
  SET is_primary = EXCLUDED.is_primary;

  -- Đảm bảo allowlist CRM NextGo hiện công ty SX NextGo
  INSERT INTO crm_company_visible_production_companies (crm_company_id, production_company_id)
  VALUES (v_nextgo, v_nextgo)
  ON CONFLICT (crm_company_id, production_company_id) DO NOTHING;

  RAISE NOTICE '455: Thùng carton → SX NextGo (workshop_type=%)', v_wt;
END $$;
