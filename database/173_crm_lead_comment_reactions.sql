-- 173_crm_lead_comment_reactions.sql
-- Cảm xúc (emoji) trên bình luận CRM: mỗi user tối đa một cảm xúc / bình luận.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_lead_comment_reactions (
  comment_id BIGINT NOT NULL REFERENCES crm_lead_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_comment_reactions_comment
  ON crm_lead_comment_reactions (comment_id);

ALTER TABLE crm_lead_comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_lead_comment_reactions'
      AND policyname = 'crm_lead_comment_reactions_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_lead_comment_reactions_all ON crm_lead_comment_reactions FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON TABLE crm_lead_comment_reactions IS 'Thả cảm xúc lên bình luận lead/deal CRM (1 emoji / user / comment)';

COMMIT;
