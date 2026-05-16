-- 171_crm_lead_comments.sql
-- Bình luận dùng chung cho lead/deal trong CRM.
-- Phục vụ view "Bình luận" — chỉ hiển thị lead/deal có ít nhất 1 bình luận.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_lead_comments (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_comments_lead_created
  ON crm_lead_comments (lead_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_lead_comments_user
  ON crm_lead_comments (user_id)
  WHERE deleted_at IS NULL;

ALTER TABLE crm_lead_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_lead_comments'
      AND policyname='crm_lead_comments_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_lead_comments_all ON crm_lead_comments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
