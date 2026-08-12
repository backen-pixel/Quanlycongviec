-- 515_crm_daily_report_user_extras.sql
-- Dòng tự thêm (Mài dao / Đề xuất / tùy chọn) lưu theo user, dùng lại các ngày sau.
BEGIN;

CREATE TABLE IF NOT EXISTS crm_daily_report_user_extras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  company_id  UUID,
  section     TEXT NOT NULL
              CHECK (section IN ('work', 'sharpen', 'proposal')),
  label       TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 100,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_daily_report_user_extras_user
  ON crm_daily_report_user_extras (user_id, section, order_index)
  WHERE is_active = true;

COMMIT;
