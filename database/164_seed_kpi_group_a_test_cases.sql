-- 164_seed_kpi_group_a_test_cases.sql
-- Seed lead/deal CHO TỪNG TRƯỜNG HỢP của KPI Nhóm A (A1..A6).
-- Idempotent: dựa code 'KPI-A-NN' để xoá rồi tạo lại.
-- CHẠY TRÊN STAGING/DEV — KHÔNG chạy production.
--
-- Test owner: user test.kpi@tubep.vn — role sales_admin nếu enum đã có (đã chạy 165 trước),
--   ngược lại role sales (seed vẫn chạy; đổi role sau bằng UPDATE nếu cần).
-- Period mặc định: tháng hiện tại (NOW()).
--
-- Sau khi chạy, gọi backend tính KPI cho user owner (POST /api/kpi/recompute hoặc job
-- nightly) để xem actual / breakdown từng KPI khớp kỳ vọng dưới đây.
--
-- ═══ Enum sales_admin (Postgres 55P04) ═══
-- ALTER TYPE … ADD VALUE phải COMMIT trước khi INSERT dùng giá trị đó.
-- Muốn user test là sales_admin: chạy RIÊNG database/165_user_role_add_sales_admin_enum.sql,
-- đợi xong, rồi chạy file này (hoặc chạy 164 một lần với role sales, sau đó chạy 165 rồi
-- UPDATE users SET role = 'sales_admin' WHERE email = 'test.kpi@tubep.vn'; rồi chạy lại 164).

BEGIN;

DO $$
DECLARE
  v_owner   UUID;
  v_pipeline UUID;
  v_company  UUID;
  v_region   UUID;
  v_customer UUID;
  v_source   UUID;
  v_now TIMESTAMPTZ := NOW();
  v_has_sales_admin BOOLEAN;

  v_stage_lead_new UUID;
  v_stage_warm     UUID;
  v_stage_quoted   UUID;
  v_stage_signed   UUID;

  v_sla_warm INT;       -- giây — đặt dynamically từ DB
BEGIN
  -- ── Resolve pipeline VPT (cùng pipeline với migration 149) ───────────────
  SELECT id, company_id INTO v_pipeline, v_company
    FROM crm_pipelines
   WHERE name ILIKE 'CRM — Bếp Vạn Phú Thành%' OR name ILIKE 'CRM - Bếp Vạn Phú Thành%'
   LIMIT 1;
  IF v_pipeline IS NULL THEN
    SELECT id, company_id INTO v_pipeline, v_company FROM crm_pipelines LIMIT 1;
  END IF;
  IF v_pipeline IS NULL THEN
    RAISE EXCEPTION '164: Không có pipeline nào trong crm_pipelines';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'sales_admin'
  ) INTO v_has_sales_admin;

  -- ── Tạo / cập nhật nhân viên test KPI ─────────────────────────────────────
  -- Email: test.kpi@tubep.vn, mật khẩu mặc định: 123456 (hash bcrypt cost 12).
  -- Role: sales_admin nếu đã chạy 165 (enum đã commit); nếu chưa thì sales + NOTICE.
  IF v_has_sales_admin THEN
    INSERT INTO users (email, password, full_name, phone, role, position, company_id, is_active)
    VALUES (
      'test.kpi@tubep.vn',
      '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
      'Test KPI',
      '0900000164',
      'sales_admin',
      'NV test KPI',
      v_company,
      true
    )
    ON CONFLICT (email) DO UPDATE SET
      full_name  = EXCLUDED.full_name,
      role       = 'sales_admin',
      company_id = EXCLUDED.company_id,
      is_active  = true;
  ELSE
    INSERT INTO users (email, password, full_name, phone, role, position, company_id, is_active)
    VALUES (
      'test.kpi@tubep.vn',
      '$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi',
      'Test KPI',
      '0900000164',
      'sales',
      'NV test KPI',
      v_company,
      true
    )
    ON CONFLICT (email) DO UPDATE SET
      full_name  = EXCLUDED.full_name,
      role       = 'sales',
      company_id = EXCLUDED.company_id,
      is_active  = true;
    RAISE NOTICE '164: enum chưa có sales_admin — user test.kpi@tubep.vn dùng role sales. Chạy riêng database/165_user_role_add_sales_admin_enum.sql rồi UPDATE users SET role = ''sales_admin'' WHERE email = ''test.kpi@tubep.vn'';';
  END IF;

  SELECT id INTO v_owner FROM users WHERE email = 'test.kpi@tubep.vn' LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '164: Không tạo / tìm được user test.kpi@tubep.vn';
  END IF;

  -- ── Lookup stages theo canonical_slug ────────────────────────────────────
  SELECT id INTO v_stage_lead_new FROM crm_pipeline_stages
    WHERE pipeline_id = v_pipeline AND canonical_slug = 'lead_new' LIMIT 1;
  SELECT id INTO v_stage_warm     FROM crm_pipeline_stages
    WHERE pipeline_id = v_pipeline AND canonical_slug = 'warm'     LIMIT 1;
  SELECT id INTO v_stage_quoted   FROM crm_pipeline_stages
    WHERE pipeline_id = v_pipeline AND canonical_slug = 'quoted'   LIMIT 1;
  SELECT id INTO v_stage_signed   FROM crm_pipeline_stages
    WHERE pipeline_id = v_pipeline AND canonical_slug = 'contract_signed' LIMIT 1;

  IF v_stage_lead_new IS NULL OR v_stage_warm IS NULL THEN
    RAISE EXCEPTION '164: Pipeline thiếu canonical_slug lead_new/warm. Chạy migration 146 trước.';
  END IF;

  -- Đảm bảo stage warm có sla_days để A5/A6 chạy được (1 ngày).
  UPDATE crm_pipeline_stages SET sla_days = 1
   WHERE id = v_stage_warm AND (sla_days IS NULL OR sla_days = 0);
  SELECT (sla_days * 86400)::INT INTO v_sla_warm
    FROM crm_pipeline_stages WHERE id = v_stage_warm;
  IF v_sla_warm IS NULL THEN v_sla_warm := 86400; END IF;

  -- ── Region + customer + source mẫu ───────────────────────────────────────
  SELECT id INTO v_region FROM company_regions
    WHERE company_id = v_company LIMIT 1;
  IF v_region IS NULL THEN
    INSERT INTO company_regions (company_id, name, is_active)
    VALUES (v_company, 'KPI-A Test Region', true)
    RETURNING id INTO v_region;
  END IF;

  SELECT id INTO v_customer FROM customers WHERE phone = '0900000164' LIMIT 1;
  IF v_customer IS NULL THEN
    INSERT INTO customers (full_name, phone, address)
    VALUES ('KPI-A Customer', '0900000164', 'Test Address')
    RETURNING id INTO v_customer;
  END IF;

  SELECT id INTO v_source FROM crm_sources LIMIT 1;

  -- ── Dọn dữ liệu cũ ───────────────────────────────────────────────────────
  DELETE FROM crm_lead_stage_history
    WHERE lead_id IN (SELECT id FROM crm_leads WHERE code LIKE 'KPI-A-%');
  DELETE FROM crm_tasks
    WHERE lead_id IN (SELECT id FROM crm_leads WHERE code LIKE 'KPI-A-%');
  DELETE FROM crm_leads WHERE code LIKE 'KPI-A-%';

  -- ════════════════════════════════════════════════════════════════════════
  -- A1/A2: Tốc độ phản hồi lead (first_touch_time - created_at)
  -- ════════════════════════════════════════════════════════════════════════

  -- A-01 ✓ A1: cham trong 5 phút (≤15p) — info_complete=true
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-01', 'A1 ✓ cham 5p', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000001', 250000000, 'Q.7', '1_2m',
          v_now - INTERVAL '20 minutes' + INTERVAL '5 minutes',
          v_now - INTERVAL '20 minutes', v_now - INTERVAL '20 minutes', v_owner);

  -- A-02 ✗ A1: cham 30p (>15p)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-02', 'A1 ✗ cham 30p', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000002', 200000000, 'Q.5', '1_2m',
          v_now - INTERVAL '2 hours' + INTERVAL '30 minutes',
          v_now - INTERVAL '2 hours', v_now - INTERVAL '2 hours', v_owner);

  -- A-03 ✗ A1: chưa cham (first_touch_time NULL — vào mẫu số, không vào tử số)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-03', 'A1 ✗ chưa cham', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000003', 180000000, 'Q.10', '1_2m',
          v_now - INTERVAL '6 hours', v_now - INTERVAL '6 hours', v_owner);

  -- A-04 ✓ A1: cham 14 phút (đúng biên SLA)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-04', 'A1 ✓ biên 14p', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000004', 320000000, 'Q.2', 'under_1m',
          v_now - INTERVAL '1 hour' + INTERVAL '14 minutes',
          v_now - INTERVAL '1 hour', v_now - INTERVAL '1 hour', v_owner);

  -- ════════════════════════════════════════════════════════════════════════
  -- A3: Tỷ lệ lead đủ thông tin chuẩn + đủ minh chứng các task gating
  -- ════════════════════════════════════════════════════════════════════════

  -- A-05 ✓ A3: info_complete=true, không có task gating chưa minh chứng
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-05', 'A3 ✓ info đủ', 'lead', v_pipeline, v_stage_warm, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000005', 400000000, 'Tân Bình', '1_2m',
          v_now - INTERVAL '1 day', v_now - INTERVAL '1 day', v_now - INTERVAL '6 hours', v_owner);

  -- A-06 ✗ A3: thiếu install_address (info_complete=false)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-06', 'A3 ✗ thiếu địa chỉ', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000006', 150000000, '1_2m',
          v_now - INTERVAL '4 hours' + INTERVAL '5 minutes',
          v_now - INTERVAL '4 hours', v_now - INTERVAL '4 hours', v_owner);

  -- A-07 ✗ A3: thiếu estimated_value
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-07', 'A3 ✗ thiếu giá trị', 'lead', v_pipeline, v_stage_lead_new, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000007', 'Q.3', '1_2m',
          v_now - INTERVAL '5 hours' + INTERVAL '8 minutes',
          v_now - INTERVAL '5 hours', v_now - INTERVAL '5 hours', v_owner);

  -- A-08 ✗ A3: info_complete=true NHƯNG có task gating đã hoàn thành mà thiếu evidence (cột completion_requires_file_or_note phải tồn tại — migration 160)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-08', 'A3 ✗ task thiếu evidence', 'lead', v_pipeline, v_stage_warm, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000008', 280000000, 'Q.4', '1_2m',
          v_now - INTERVAL '2 days', v_now - INTERVAL '2 days', v_now - INTERVAL '12 hours', v_owner);

  -- ════════════════════════════════════════════════════════════════════════
  -- A4: Follow-up đúng lịch (crm_tasks.deadline trong kỳ, completed_at ≤ deadline)
  -- ════════════════════════════════════════════════════════════════════════

  -- Lead giữ context cho A4 (tasks gắn vào A-05/A-08 + 2 lead riêng)
  -- Task ✓ A4: hoàn thành sớm hơn deadline 1h
  INSERT INTO crm_tasks (lead_id, title, status, assignee_id, deadline, completed_at, created_by)
  SELECT id, 'A4 ✓ done sớm', 'completed', v_owner,
         v_now + INTERVAL '6 hours', v_now + INTERVAL '5 hours', v_owner
  FROM crm_leads WHERE code = 'KPI-A-05';

  -- Task ✗ A4: hoàn thành sau deadline
  INSERT INTO crm_tasks (lead_id, title, status, assignee_id, deadline, completed_at, created_by)
  SELECT id, 'A4 ✗ done trễ', 'completed', v_owner,
         v_now - INTERVAL '6 hours', v_now - INTERVAL '2 hours', v_owner
  FROM crm_leads WHERE code = 'KPI-A-05';

  -- Task ✗ A4: chưa hoàn thành dù đã quá deadline
  INSERT INTO crm_tasks (lead_id, title, status, assignee_id, deadline, created_by)
  SELECT id, 'A4 ✗ pending quá hạn', 'pending', v_owner,
         v_now - INTERVAL '3 hours', v_owner
  FROM crm_leads WHERE code = 'KPI-A-08';

  -- Task gating cho A3 fail (completion_requires_file_or_note=true, completed mà notes rỗng + không attachment)
  -- Chỉ thêm cột nếu migration 160 đã áp dụng.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='crm_tasks' AND column_name='completion_requires_file_or_note'
  ) THEN
    INSERT INTO crm_tasks (lead_id, title, status, assignee_id, deadline, completed_at,
                            completion_requires_file_or_note, notes, created_by)
    SELECT id, 'A3 gating: completed thiếu evidence', 'completed', v_owner,
           v_now + INTERVAL '1 day', v_now,
           true, NULL, v_owner
    FROM crm_leads WHERE code = 'KPI-A-08';
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- A5: SLA stage transition (history.duration_seconds vs stage.sla_days)
  -- Stage 'warm' đã set sla_days = 1 (= 86400s)
  -- ════════════════════════════════════════════════════════════════════════

  -- A-09 deal: warm → quoted, transition đúng SLA (12h <= 24h)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-09', 'A5 ✓ stage SLA OK', 'deal', v_pipeline, COALESCE(v_stage_quoted, v_stage_warm), v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000009', 600000000, 'Phú Mỹ Hưng', '1_2m',
          v_now - INTERVAL '5 days', v_now - INTERVAL '6 days', v_now - INTERVAL '12 hours', v_owner);

  INSERT INTO crm_lead_stage_history (lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds, changed_by)
  SELECT id, 'deal', 'designing', 'warm',
         v_now - INTERVAL '36 hours', v_now - INTERVAL '24 hours', 12 * 3600, v_owner
  FROM crm_leads WHERE code = 'KPI-A-09';

  -- A-10 deal: warm → quoted, transition vi phạm SLA (48h > 24h)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-10', 'A5 ✗ stage SLA fail', 'deal', v_pipeline, COALESCE(v_stage_quoted, v_stage_warm), v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000010', 480000000, 'Q.10', '1_2m',
          v_now - INTERVAL '7 days', v_now - INTERVAL '8 days', v_now - INTERVAL '6 hours', v_owner);

  INSERT INTO crm_lead_stage_history (lead_id, pipeline_type, from_canonical_slug, to_canonical_slug, entered_at, exited_at, duration_seconds, changed_by)
  SELECT id, 'deal', 'designing', 'warm',
         v_now - INTERVAL '4 days', v_now - INTERVAL '2 days', 48 * 3600, v_owner
  FROM crm_leads WHERE code = 'KPI-A-10';

  -- ════════════════════════════════════════════════════════════════════════
  -- A6: Snapshot — đếm lead/deal đang vượt SLA hiện tại (stage_entered_at > sla_days ago)
  -- ════════════════════════════════════════════════════════════════════════

  -- A-11 ✓ vượt SLA: stage warm sla=1d, đã ở stage 3 ngày
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-11', 'A6 ✓ vượt SLA 3 ngày', 'lead', v_pipeline, v_stage_warm, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000011', 320000000, 'Q.6', '1_2m',
          v_now - INTERVAL '5 days', v_now - INTERVAL '5 days', v_now - INTERVAL '3 days', v_owner);

  -- A-12 ✗ chưa vượt: vào stage 5h trước (sla=24h)
  INSERT INTO crm_leads (code, title, type, pipeline_id, stage_id, source_id, company_id,
                         lead_owner_id, assigned_to, customer_id, region_id,
                         phone, estimated_value, install_address, expected_construction_time,
                         first_touch_time, created_at, stage_entered_at, created_by)
  VALUES ('KPI-A-12', 'A6 ✗ trong SLA', 'lead', v_pipeline, v_stage_warm, v_source, v_company,
          v_owner, v_owner, v_customer, v_region,
          '0911000012', 270000000, 'Q.8', '1_2m',
          v_now - INTERVAL '5 hours', v_now - INTERVAL '5 hours', v_now - INTERVAL '5 hours', v_owner);

  RAISE NOTICE '164: Đã seed 12 lead/deal test cho KPI Nhóm A. Owner=%, Pipeline=%, sla_warm=%s', v_owner, v_pipeline, v_sla_warm;
END $$;

COMMIT;
