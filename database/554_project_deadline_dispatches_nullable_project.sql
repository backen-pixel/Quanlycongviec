-- 554: Cho phép project_id NULL (CRM-only / tin test không gắn projects).
-- Idempotent.

ALTER TABLE public.project_deadline_dispatches
  ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON COLUMN public.project_deadline_dispatches.project_id IS
  'UUID công trình; NULL khi nhắc hạn CRM chưa gắn project hoặc bản ghi test.';
