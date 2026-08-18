-- 533_crm_daily_report_user_templates.sql
-- Gán mẫu báo cáo hằng ngày cho từng nhân viên (thay vì đoán theo role + tên phòng ban).
-- Bản gán này có ưu tiên cao nhất khi gom nhóm bảng Tổng hợp và khi tạo phiếu mới.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_daily_report_user_templates (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  template_id  UUID NOT NULL REFERENCES crm_daily_report_templates(id) ON DELETE CASCADE,
  assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_rpt_user_tpl_company
  ON crm_daily_report_user_templates (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_daily_rpt_user_tpl_template
  ON crm_daily_report_user_templates (template_id);

ALTER TABLE crm_daily_report_user_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_daily_report_user_templates'
      AND policyname='crm_daily_report_user_templates_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_daily_report_user_templates_all ON crm_daily_report_user_templates FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
