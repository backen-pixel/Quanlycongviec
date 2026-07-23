-- 458: Trigger "hàng đã hoàn thiện đóng gói" trên SX + booking VC trên project.
-- Bổ sung:
--   * production_pipeline_stages.is_packaging_done → SX kéo project vào cột này
--     sẽ tự đồng bộ CRM sang stage có sync_role='sx_completed'.
--   * projects.pickup_at, projects.pickup_notes → sale chọn ở modal khi kéo deal
--     qua cột Vận chuyển.
-- Idempotent, có backfill cho các cột SX tên chứa "đóng gói".

BEGIN;

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_packaging_done boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_prod_stages_packaging_done
  ON production_pipeline_stages(company_id)
  WHERE is_packaging_done = true;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pickup_at timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_notes text;

-- Backfill: bật is_packaging_done cho các cột SX tên chứa "đóng gói" (unaccent-free)
-- nhưng không đè khi admin đã tự bật ở nơi khác.
UPDATE production_pipeline_stages
SET is_packaging_done = true
WHERE is_packaging_done = false
  AND (
    LOWER(name) LIKE '%đóng gói%'
    OR LOWER(name) LIKE '%dong goi%'
    OR LOWER(name) LIKE '%hoàn thiện đóng gói%'
    OR LOWER(name) LIKE '%vệ sinh đóng gói%'
  );

COMMIT;
