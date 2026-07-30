-- 479: bucket_slug unique theo tab (mỗi tab có intake/done riêng)

BEGIN;

DROP INDEX IF EXISTS uq_app_module_stages_bucket;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_module_stages_tab_bucket
  ON app_module_pipeline_stages(module_id, tab_id, bucket_slug)
  WHERE bucket_slug IS NOT NULL AND tab_id IS NOT NULL;

-- Stages chưa có tab_id: giữ unique theo module như cũ
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_module_stages_bucket_no_tab
  ON app_module_pipeline_stages(module_id, bucket_slug)
  WHERE bucket_slug IS NOT NULL AND tab_id IS NULL;

COMMIT;
