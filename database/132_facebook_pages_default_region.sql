-- Gán khu vực CRM mặc định cho từng Facebook Page (lead tạo từ Page kế thừa region_id).

ALTER TABLE facebook_pages
  ADD COLUMN IF NOT EXISTS default_region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS facebook_pages_default_region_id_idx
  ON facebook_pages (default_region_id);

COMMENT ON COLUMN facebook_pages.default_region_id IS
  'Khu vực CRM (company_regions) gán mặc định cho lead/deal tạo từ Page này';
