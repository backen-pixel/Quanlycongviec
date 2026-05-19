-- 195_crm_assignment_comments_parent_id.sql
-- Trả lời bình luận nhiệm vụ Giao việc CRM. Idempotent.

BEGIN;

ALTER TABLE crm_assignment_comments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES crm_assignment_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_crm_assignment_comments_parent
  ON crm_assignment_comments (assignment_id, parent_id, created_at);

COMMENT ON COLUMN crm_assignment_comments.parent_id IS 'NULL = bình luận gốc; khác NULL = trả lời comment id=parent_id';

COMMIT;
