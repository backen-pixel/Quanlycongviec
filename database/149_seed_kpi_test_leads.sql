-- 149_seed_kpi_test_leads.sql
-- SEED 10 lead mẫu trải đều stage canonical pipeline VPT để smoke test KPI.
-- Idempotent: dựa vào code='KPI-TEST-NN' để tránh trùng.
-- CHỈ chạy trên môi trường staging / dev — KHÔNG chạy production.
--
-- Sau khi chạy:
--   * 10 lead/deal mới với owner = user smoke
--   * Một số có first_touch_time, một số chưa (test KPI A1, A2)
--   * Stage trải qua các canonical_slug khác nhau (test KPI B*, C*)

DO $$
DECLARE
  v_owner UUID;
  v_pipeline UUID;
  v_company UUID;
  v_source UUID;
  v_now TIMESTAMPTZ := NOW();
  v_stage_lead_new UUID;
  v_stage_cold UUID;
  v_stage_warm UUID;
  v_stage_hot UUID;
  v_stage_survey UUID;
  v_stage_designing UUID;
  v_stage_quoted UUID;
  v_stage_signed UUID;
  v_stage_lost UUID;
  i INT;
BEGIN
  -- Owner test: ưu tiên user có email chứa 'sales' hoặc 'kpi-test', fallback admin đầu tiên
  SELECT id INTO v_owner FROM users WHERE email ILIKE '%kpi-test%' LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM users WHERE LOWER(role) = 'sales' LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM users WHERE LOWER(role) = 'admin' LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '149: Không tìm thấy user test. Tạo trước user sales/admin.';
  END IF;

  -- Pipeline VPT
  SELECT id, company_id INTO v_pipeline, v_company
    FROM crm_pipelines
   WHERE name ILIKE 'CRM — Bếp Vạn Phú Thành%' OR name ILIKE 'CRM - Bếp Vạn Phú Thành%'
   LIMIT 1;
  IF v_pipeline IS NULL THEN
    RAISE EXCEPTION '149: Không tìm thấy pipeline VPT. Chạy migration 125 trước.';
  END IF;

  SELECT id INTO v_source FROM crm_sources LIMIT 1;

  -- Lookup stage IDs theo canonical_slug
  SELECT id INTO v_stage_lead_new  FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'lead_new'   LIMIT 1;
  SELECT id INTO v_stage_cold      FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'cold'       LIMIT 1;
  SELECT id INTO v_stage_warm      FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'warm'       LIMIT 1;
  SELECT id INTO v_stage_hot       FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'hot'        LIMIT 1;
  SELECT id INTO v_stage_survey    FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'survey_done' LIMIT 1;
  SELECT id INTO v_stage_designing FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'designing'  LIMIT 1;
  SELECT id INTO v_stage_quoted    FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'quoted'     LIMIT 1;
  SELECT id INTO v_stage_signed    FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'contract_signed' LIMIT 1;
  SELECT id INTO v_stage_lost      FROM crm_pipeline_stages WHERE pipeline_id = v_pipeline AND canonical_slug = 'lost'       LIMIT 1;

  IF v_stage_lead_new IS NULL OR v_stage_signed IS NULL THEN
    RAISE EXCEPTION '149: Pipeline VPT thiếu canonical_slug. Chạy migration 146 trước.';
  END IF;

  -- Xoá các test lead cũ
  DELETE FROM crm_leads WHERE code LIKE 'KPI-TEST-%';

  -- 10 lead/deal mẫu
  -- Lead 1: lead_new, có first_touch_time đúng SLA 15p (A1 ✓)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-01', 'Test Lead nhanh - A.Nam', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company, v_owner, v_owner,
          '0901111111', 250000000, 'Q.7 HCM', '1_2m',
          v_now - INTERVAL '5 minutes' + INTERVAL '10 minutes',
          v_now - INTERVAL '5 minutes', v_now - INTERVAL '5 minutes', v_owner);

  -- Lead 2: lead_new, first_touch trễ 30p (A1 ✗)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-02', 'Test Lead chậm - C.Mai', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company, v_owner, v_owner,
          '0902222222', 180000000, 'Q.Bình Thạnh', 'over_2m',
          v_now - INTERVAL '2 hours' + INTERVAL '30 minutes',
          v_now - INTERVAL '2 hours', v_now - INTERVAL '2 hours', v_owner);

  -- Lead 3: cold, chưa cham (A1 ✗, A3 ✗ thiếu thông tin)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-03', 'Test Cold không TT', 'lead', v_pipeline, v_stage_cold, v_source, v_company, v_owner, v_owner,
          '0903333333', v_now - INTERVAL '3 days', v_now - INTERVAL '3 days', v_owner);

  -- Lead 4: warm
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-04', 'Test Warm', 'lead', v_pipeline, v_stage_warm, v_source, v_company, v_owner, v_owner,
          '0904444444', 350000000, 'Q.2 HCM', '1_2m',
          v_now - INTERVAL '1 day', v_now - INTERVAL '2 days', v_now - INTERVAL '1 day', v_owner);

  -- Lead 5: hot
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-05', 'Test Hot - cần gấp', 'lead', v_pipeline, v_stage_hot, v_source, v_company, v_owner, v_owner,
          '0905555555', 500000000, 'Tân Bình', 'under_1m',
          v_now - INTERVAL '6 hours', v_now - INTERVAL '12 hours', v_now - INTERVAL '6 hours', v_owner);

  -- Lead 6: survey_done (đã khảo sát)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-06', 'Test Khảo sát xong', 'lead', v_pipeline, v_stage_survey, v_source, v_company, v_owner, v_owner,
          '0906666666', 420000000, 'Thủ Đức', '1_2m',
          v_now - INTERVAL '4 days', v_now - INTERVAL '5 days', v_now - INTERVAL '1 day', v_owner);

  -- Deal 7: designing
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-07', 'Test Deal đang TK', 'deal', v_pipeline, v_stage_designing, v_source, v_company, v_owner, v_owner,
          '0907777777', 380000000, 'Q.10', '1_2m',
          v_now - INTERVAL '6 days', v_now - INTERVAL '7 days', v_now - INTERVAL '3 hours', v_owner);

  -- Deal 8: quoted
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-08', 'Test Deal đã báo giá', 'deal', v_pipeline, v_stage_quoted, v_source, v_company, v_owner, v_owner,
          '0908888888', 600000000, 'Phú Mỹ Hưng', '1_2m',
          v_now - INTERVAL '8 days', v_now - INTERVAL '10 days', v_now - INTERVAL '1 day', v_owner);

  -- Deal 9: contract_signed (KPI C1 doanh số ✓)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time, actual_close_date,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-09', 'Test Đã ký HD', 'deal', v_pipeline, v_stage_signed, v_source, v_company, v_owner, v_owner,
          '0909999999', 750000000, 'Bình Thạnh', 'under_1m', CURRENT_DATE,
          v_now - INTERVAL '15 days', v_now - INTERVAL '20 days', v_now - INTERVAL '2 days', v_owner);

  -- Deal 10: lost (C4)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id, lead_owner_id, assigned_to,
                          phone, estimated_value, install_address, expected_construction_time, lost_reason,
                          first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-TEST-10', 'Test Mất - chê giá', 'deal', v_pipeline, v_stage_lost, v_source, v_company, v_owner, v_owner,
          '0900000000', 290000000, 'Q.3', '1_2m', 'Chê giá cao',
          v_now - INTERVAL '12 days', v_now - INTERVAL '14 days', v_now - INTERVAL '1 day', v_owner);

  -- Stage history giả lập transition (cho KPI B3, B4)
  -- Lead 6: lead_new -> survey_done
  INSERT INTO crm_lead_stage_history (lead_id, pipeline_type, to_canonical_slug, entered_at, exited_at, duration_seconds, changed_by)
  SELECT id, 'lead', 'lead_new', v_now - INTERVAL '5 days', v_now - INTERVAL '4 days', 86400, v_owner FROM crm_leads WHERE code = 'KPI-TEST-06';

  -- Deal 8: designing → quoted
  INSERT INTO crm_lead_stage_history (lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds, changed_by)
  SELECT id, 'deal', 'designing', 'quoted', v_now - INTERVAL '4 days', v_now - INTERVAL '1 day', 259200, v_owner FROM crm_leads WHERE code = 'KPI-TEST-08';

  -- Deal 9: quoted → contract_signed (B4 ✓)
  INSERT INTO crm_lead_stage_history (lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds, changed_by)
  SELECT id, 'deal', 'quoted', 'contract_signed', v_now - INTERVAL '5 days', v_now - INTERVAL '2 days', 259200, v_owner FROM crm_leads WHERE code = 'KPI-TEST-09';

  -- Deal 10: quoted → lost (B4 ✗)
  INSERT INTO crm_lead_stage_history (lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds, changed_by)
  SELECT id, 'deal', 'quoted', 'lost', v_now - INTERVAL '3 days', v_now - INTERVAL '1 day', 172800, v_owner FROM crm_leads WHERE code = 'KPI-TEST-10';

  RAISE NOTICE '149: Đã seed 10 lead test cho user owner_id=%', v_owner;
END $$;
