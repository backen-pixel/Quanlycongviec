-- 478: Stage flags — chuyển tab + Hoàn thành / Hủy

BEGIN;

ALTER TABLE app_module_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transfer_tab_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN app_module_pipeline_stages.is_done IS
  'Cột hoàn thành (tương tự is_won CRM).';
COMMENT ON COLUMN app_module_pipeline_stages.is_lost IS
  'Cột hủy / mất (tương tự is_lost CRM).';
COMMENT ON COLUMN app_module_pipeline_stages.transfer_tab_ids IS
  'Danh sách tab_id trong cùng module — hiện nút chuyển thẻ sang tab đó.';

-- Đồng bộ bucket_slug done ↔ is_done (best-effort)
UPDATE app_module_pipeline_stages
SET is_done = TRUE
WHERE bucket_slug = 'done' AND is_done = FALSE;

COMMIT;
