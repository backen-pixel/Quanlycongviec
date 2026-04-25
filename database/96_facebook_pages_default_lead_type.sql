-- Migration 96: Facebook Page default lead type

ALTER TABLE facebook_pages
  ADD COLUMN IF NOT EXISTS default_lead_type_id UUID REFERENCES crm_lead_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS facebook_pages_default_lead_type_idx
  ON facebook_pages (default_lead_type_id);

COMMENT ON COLUMN facebook_pages.default_lead_type_id IS 'Loại Lead mặc định khi auto tạo lead từ page này';
