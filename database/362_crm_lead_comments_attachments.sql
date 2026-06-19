-- 362_crm_lead_comments_attachments.sql
-- Đính kèm file/hình trong bình luận lead/deal CRM (dùng chung tab Bình luận module SX web).
BEGIN;

ALTER TABLE crm_lead_comments
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN crm_lead_comments.attachments IS
  'Mảng đính kèm: [{url, name, type, size}] — url dạng /uploads/...';

COMMIT;
