-- 332: Cột Kanban Giao việc — đánh dấu cột "Đang làm" (kéo việc vào → status in_progress)

BEGIN;

ALTER TABLE crm_assignment_columns
  ADD COLUMN IF NOT EXISTS is_in_progress_column BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_assignment_columns.is_in_progress_column IS
  'true = cột đang làm; kéo/thả nhiệm vụ vào đây tự set status in_progress.';

-- Gán cột "Đang làm" mặc định (nếu có)
UPDATE crm_assignment_columns
SET is_in_progress_column = true
WHERE is_in_progress_column = false
  AND (
    lower(trim(name)) IN ('đang làm', 'dang lam', 'doing', 'in progress')
    OR (position = 1 AND is_done_column = false)
  );

COMMIT;
