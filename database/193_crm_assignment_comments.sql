-- 193_crm_assignment_comments.sql
-- Ghi chú / bình luận cho nhiệm vụ "Giao việc CRM". Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_assignment_comments (
  id             BIGSERIAL PRIMARY KEY,
  assignment_id  BIGINT NOT NULL REFERENCES crm_assignments(id) ON DELETE CASCADE,
  user_id        UUID   NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  content        TEXT   NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_comments_assignment
  ON crm_assignment_comments (assignment_id, created_at);

ALTER TABLE crm_assignment_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignment_comments'
      AND policyname='crm_assignment_comments_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignment_comments_all ON crm_assignment_comments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
