-- 410_crm_lead_comment_read_receipts.sql
-- Theo dõi lần đọc bình luận lead/deal CRM cuối cùng của từng user.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_lead_comment_read_receipts (
  lead_id      UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_comment_read_receipts_user
  ON crm_lead_comment_read_receipts (user_id);

ALTER TABLE crm_lead_comment_read_receipts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_lead_comment_read_receipts'
      AND policyname = 'crm_lead_comment_read_receipts_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_lead_comment_read_receipts_all ON crm_lead_comment_read_receipts FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON TABLE crm_lead_comment_read_receipts IS 'Thời điểm user đọc bình luận lead/deal lần cuối — hiển thị Đã xem / Đã nhận';

COMMIT;
