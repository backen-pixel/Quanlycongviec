-- Gán company_id cho nguồn Facebook: đồng bộ từ facebook_pages + backfill Phúc Đạt cho nguồn [FB:…] còn trống

-- 1) Page đã có default_source_id trỏ tới crm_sources
UPDATE crm_sources s
SET company_id = p.default_company_id
FROM facebook_pages p
WHERE s.id = p.default_source_id
  AND p.default_company_id IS NOT NULL
  AND (s.company_id IS DISTINCT FROM p.default_company_id);

-- 2) Khớp page_id trong tên chuẩn [FB:page_id] …
UPDATE crm_sources s
SET company_id = p.default_company_id
FROM facebook_pages p
WHERE s.name ~ '^\[FB:[0-9]+\]'
  AND p.default_company_id IS NOT NULL
  AND p.page_id = (regexp_match(s.name, '\[FB:([0-9]+)\]'))[1]
  AND (s.company_id IS DISTINCT FROM p.default_company_id);

-- 3) Nguồn [FB:…] vẫn chưa có công ty → gán Phúc Đạt (cùng logic tìm công ty như migration 119)
DO $$
DECLARE
  phuc_id UUID;
BEGIN
  SELECT id INTO phuc_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
     OR (name ILIKE '%Phúc%' AND name ILIKE '%Đạt%')
  LIMIT 1;

  IF phuc_id IS NULL THEN
    RAISE NOTICE '122: Không tìm thấy công ty Phúc Đạt — bỏ qua backfill nguồn FB';
    RETURN;
  END IF;

  UPDATE crm_sources
  SET company_id = phuc_id
  WHERE company_id IS NULL
    AND name ~ '^\[FB:[0-9]+\]';
END $$;

COMMENT ON COLUMN crm_sources.company_id IS 'NULL = nguồn chung; Facebook: nên trùng default_company_id của Page / công ty CRM';
