-- 172_crm_lead_comments_parent_id.sql
-- Trả lời bình luận (thread): parent_id trỏ tới bình luận được trả lời (cùng lead).
-- Idempotent.

BEGIN;

ALTER TABLE crm_lead_comments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES crm_lead_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_crm_lead_comments_lead_parent
  ON crm_lead_comments (lead_id, parent_id, created_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN crm_lead_comments.parent_id IS 'NULL = bình luận gốc; khác NULL = trả lời bình luận id=parent_id';

COMMIT;
