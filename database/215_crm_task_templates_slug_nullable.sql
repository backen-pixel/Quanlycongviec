-- 215_crm_task_templates_slug_nullable.sql
-- Cho phép crm_task_templates.stage_slug NULL.
--
-- Trước: stage_slug TEXT NOT NULL (migration 28) → buộc mọi bộ mẫu phải có 1 slug
--        trong tập legacy (consulting/design/quotation/contract/deal_*).
--
-- Giờ: bộ mẫu có thể gắn trực tiếp vào pipeline_stage_id (UUID stage thật của công ty)
--      → KHÔNG cần slug nữa. Slug chỉ còn dùng cho "bộ mẫu chung" legacy.
--
-- Idempotent.

BEGIN;

ALTER TABLE crm_task_templates
  ALTER COLUMN stage_slug DROP NOT NULL;

COMMENT ON COLUMN crm_task_templates.stage_slug IS
  'Slug giai đoạn (legacy/global). NULL khi bộ mẫu gắn trực tiếp vào pipeline_stage_id của công ty.';

COMMIT;
