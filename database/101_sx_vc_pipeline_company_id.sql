-- Pipeline Kanban SX / VC theo công ty (giống CRM): company_id NULL = mặc định chung;
-- nếu có ít nhất một dòng với company_id = X thì công ty X chỉ dùng các dòng đó.

ALTER TABLE production_pipeline_stages
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_production_pipeline_stages_company
  ON production_pipeline_stages(company_id);

CREATE INDEX IF NOT EXISTS idx_logistics_pipeline_stages_company
  ON logistics_pipeline_stages(company_id);

-- Thay unique bucket theo phạm vi: global (NULL company) hoặc theo công ty
DROP INDEX IF EXISTS production_pipeline_stages_bucket_slug_uq;

CREATE UNIQUE INDEX IF NOT EXISTS production_pipeline_stages_bucket_global_uq
  ON production_pipeline_stages (bucket_slug)
  WHERE bucket_slug IS NOT NULL AND company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_pipeline_stages_bucket_company_uq
  ON production_pipeline_stages (company_id, bucket_slug)
  WHERE bucket_slug IS NOT NULL AND company_id IS NOT NULL;

DROP INDEX IF EXISTS logistics_pipeline_stages_bucket_slug_uq;

CREATE UNIQUE INDEX IF NOT EXISTS logistics_pipeline_stages_bucket_global_uq
  ON logistics_pipeline_stages (bucket_slug)
  WHERE bucket_slug IS NOT NULL AND company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS logistics_pipeline_stages_bucket_company_uq
  ON logistics_pipeline_stages (company_id, bucket_slug)
  WHERE bucket_slug IS NOT NULL AND company_id IS NOT NULL;

COMMENT ON COLUMN production_pipeline_stages.company_id IS 'NULL: pipeline mặc định toàn hệ thống; có giá trị: pipeline riêng công ty (ưu tiên hơn mặc định)';
COMMENT ON COLUMN logistics_pipeline_stages.company_id IS 'NULL: pipeline mặc định; có giá trị: pipeline riêng công ty';
