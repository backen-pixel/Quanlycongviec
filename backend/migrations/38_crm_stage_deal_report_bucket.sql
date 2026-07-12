-- Phân loại cột pipeline Deal cho báo cáo Lead/Deal theo NV (Staff report).
-- NULL = dùng quy tắc canonical_slug / is_won mặc định.

ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS deal_report_bucket TEXT;

COMMENT ON COLUMN crm_pipeline_stages.deal_report_bucket IS
  'BC Lead/Deal theo NV: pre_contract | implementation | completed | lost. NULL = tự động theo slug.';

ALTER TABLE crm_pipeline_stages
  DROP CONSTRAINT IF EXISTS crm_pipeline_stages_deal_report_bucket_check;

ALTER TABLE crm_pipeline_stages
  ADD CONSTRAINT crm_pipeline_stages_deal_report_bucket_check
  CHECK (deal_report_bucket IS NULL OR deal_report_bucket IN ('pre_contract', 'implementation', 'completed', 'lost'));

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_deal_report_bucket
  ON crm_pipeline_stages (deal_report_bucket)
  WHERE deal_report_bucket IS NOT NULL AND pipeline_type = 'deal';
