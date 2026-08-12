-- 509_crm_daily_reports.sql
-- Báo cáo / lập kế hoạch ngày (chấm công theo form Excel Sale Admin / TK-KS).
-- Idempotent.

BEGIN;

-- ─── 1) Template theo vị trí / bộ phận ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_daily_report_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  role_key          TEXT NOT NULL,           -- sale_admin | design_survey | custom
  name              TEXT NOT NULL,
  description       TEXT,
  has_sharpen_section BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_daily_report_templates_company_role
  ON crm_daily_report_templates (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role_key);

CREATE INDEX IF NOT EXISTS idx_crm_daily_report_templates_company
  ON crm_daily_report_templates (company_id) WHERE is_active = true;

-- ─── 2) Dòng hạng mục trong template ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_daily_report_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES crm_daily_report_templates(id) ON DELETE CASCADE,
  section       TEXT NOT NULL DEFAULT 'work'
                CHECK (section IN ('work', 'sharpen')),
  label         TEXT NOT NULL,
  order_index   INT NOT NULL DEFAULT 0,
  unit_label    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_report_template_items_tmpl
  ON crm_daily_report_template_items (template_id, section, order_index);

-- ─── 3) Phiếu báo cáo ngày (1 NV / 1 ngày) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_daily_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id          UUID NOT NULL REFERENCES crm_daily_report_templates(id) ON DELETE RESTRICT,
  report_date          DATE NOT NULL,
  department_name      TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'plan_submitted', 'result_submitted', 'late')),
  plan_submitted_at    TIMESTAMPTZ,
  result_submitted_at  TIMESTAMPTZ,
  manager_note         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_reports_company_date
  ON crm_daily_reports (company_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_daily_reports_date_status
  ON crm_daily_reports (report_date, status);
CREATE INDEX IF NOT EXISTS idx_crm_daily_reports_user_date
  ON crm_daily_reports (user_id, report_date DESC);

-- ─── 4) Dòng số liệu Plan / Result ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_daily_report_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES crm_daily_reports(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES crm_daily_report_template_items(id) ON DELETE SET NULL,
  section         TEXT NOT NULL DEFAULT 'work'
                  CHECK (section IN ('work', 'sharpen')),
  label           TEXT NOT NULL,
  order_index     INT NOT NULL DEFAULT 0,
  plan_value      NUMERIC,
  result_value    NUMERIC,
  plan_note       TEXT,
  result_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_report_lines_report
  ON crm_daily_report_lines (report_id, section, order_index);

-- ─── RLS (backend service-role; mở policy all như các bảng CRM khác) ─────────
ALTER TABLE crm_daily_report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_daily_report_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_daily_report_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_daily_report_templates'
      AND policyname='crm_daily_report_templates_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_daily_report_templates_all ON crm_daily_report_templates FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_daily_report_template_items'
      AND policyname='crm_daily_report_template_items_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_daily_report_template_items_all ON crm_daily_report_template_items FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_daily_reports'
      AND policyname='crm_daily_reports_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_daily_reports_all ON crm_daily_reports FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_daily_report_lines'
      AND policyname='crm_daily_report_lines_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_daily_report_lines_all ON crm_daily_report_lines FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─── Seed template hệ thống (company_id NULL) ────────────────────────────────
INSERT INTO crm_daily_report_templates (id, company_id, role_key, name, description, has_sharpen_section)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    NULL,
    'sale_admin',
    'Sale Admin',
    'Form báo cáo / lập kế hoạch vị trí Sale Admin (chấm công ngày)',
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    NULL,
    'design_survey',
    'Thiết kế - Khảo sát',
    'Form báo cáo / lập kế hoạch vị trí Thiết kế - Khảo sát',
    true
  )
ON CONFLICT DO NOTHING;

-- Re-seed items safely: delete + insert for system templates only
DELETE FROM crm_daily_report_template_items
WHERE template_id IN (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002'
);

INSERT INTO crm_daily_report_template_items (template_id, section, label, order_index) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'work', 'Lead mới tiếp nhận', 1),
  ('a1000000-0000-4000-8000-000000000001', 'work', 'Liên hệ khách không trả lời', 2),
  ('a1000000-0000-4000-8000-000000000001', 'work', 'Chăm lại Lead Cold', 3),
  ('a1000000-0000-4000-8000-000000000001', 'work', 'Chăm lại Lead Warm', 4),
  ('a1000000-0000-4000-8000-000000000001', 'work', 'Chăm lại Lead Hot', 5),
  ('a1000000-0000-4000-8000-000000000001', 'work', 'Chốt khách khảo sát', 6),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Đi hỗ trợ tư vấn', 1),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Thiết kế mới', 2),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Sửa thiết kế', 3),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Thiết kế Concept', 4),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Duyệt TK - về sản xuất - Đặt hàng', 5),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Theo dõi Lắp đặt', 6),
  ('a1000000-0000-4000-8000-000000000002', 'work', 'Khảo sát', 7),
  ('a1000000-0000-4000-8000-000000000002', 'sharpen', 'Học / đào tạo nội bộ', 1),
  ('a1000000-0000-4000-8000-000000000002', 'sharpen', 'Cải tiến quy trình / tool', 2),
  ('a1000000-0000-4000-8000-000000000002', 'sharpen', 'Khác (ghi chú)', 3);

COMMIT;
