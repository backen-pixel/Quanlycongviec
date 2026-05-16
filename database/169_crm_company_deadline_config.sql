-- 169_crm_company_deadline_config.sql
-- Cấu hình "trường deadline" và các bucket hiển thị cho view Deadline CRM theo công ty.
--
-- - primary_field / fallback_field: tên cột nguồn deadline cho lead/deal.
--   Hợp lệ: 'expected_close_date' | 'crm_next_open_task_deadline' | NULL.
--   Frontend/backend dùng primary trước, nếu rỗng thì fallback.
-- - buckets JSONB: cấu hình các nhóm thời gian hiển thị (bật/tắt + label + ngưỡng ngày).
--   Bucket key cố định: overdue, today, this_week, next_week,
--                       in_2_weeks, in_3_weeks, in_4_weeks, in_1_month, next_month, no_deadline.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_company_deadline_config (
  company_id     UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  primary_field  TEXT NOT NULL DEFAULT 'crm_next_open_task_deadline',
  fallback_field TEXT          DEFAULT 'expected_close_date',
  buckets        JSONB NOT NULL DEFAULT '{
    "overdue":      {"enabled": true,  "label": "Quá hạn"},
    "today":        {"enabled": true,  "label": "Hôm nay"},
    "this_week":    {"enabled": true,  "label": "Tuần này"},
    "next_week":    {"enabled": true,  "label": "Tuần sau"},
    "in_2_weeks":   {"enabled": true,  "label": "Trong 2 tuần", "days": 14},
    "in_3_weeks":   {"enabled": true,  "label": "Trong 3 tuần", "days": 21},
    "in_4_weeks":   {"enabled": true,  "label": "Trong 4 tuần", "days": 28},
    "in_1_month":   {"enabled": true,  "label": "Trong 1 tháng", "days": 30},
    "next_month":   {"enabled": true,  "label": "Tháng sau"},
    "no_deadline":  {"enabled": true,  "label": "Không hạn"}
  }'::jsonb,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_company_deadline_config_primary_chk
    CHECK (primary_field IN ('expected_close_date','crm_next_open_task_deadline')),
  CONSTRAINT crm_company_deadline_config_fallback_chk
    CHECK (fallback_field IS NULL OR fallback_field IN ('expected_close_date','crm_next_open_task_deadline'))
);

COMMENT ON TABLE crm_company_deadline_config IS
  'Cấu hình trường nguồn deadline + bucket hiển thị view Deadline CRM, theo công ty.';

ALTER TABLE crm_company_deadline_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_company_deadline_config'
      AND policyname='crm_company_deadline_config_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_company_deadline_config_all ON crm_company_deadline_config FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
