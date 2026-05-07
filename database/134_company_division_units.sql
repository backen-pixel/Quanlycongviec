-- Một công ty có thể thuộc nhiều Khối (ecosystem đơn vị cấp division).
-- companies.division_unit_id = khối chính (hiển thị trong cây HST + sync ecosystem_unit cha).
-- company_division_units = tất cả khối (lọc module CRM/SX/VC, quyền).

CREATE TABLE IF NOT EXISTS company_division_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  division_unit_id UUID NOT NULL REFERENCES ecosystem_units(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, division_unit_id)
);

CREATE INDEX IF NOT EXISTS idx_company_division_units_company ON company_division_units(company_id);
CREATE INDEX IF NOT EXISTS idx_company_division_units_division ON company_division_units(division_unit_id);

COMMENT ON TABLE company_division_units IS 'Gán công ty vào nhiều Khối; is_primary đồng bộ với companies.division_unit_id';

-- Backfill: mỗi công ty đã có division_unit_id → một dòng liên kết (primary)
INSERT INTO company_division_units (company_id, division_unit_id, is_primary)
SELECT c.id, c.division_unit_id, true
FROM companies c
WHERE c.division_unit_id IS NOT NULL
ON CONFLICT (company_id, division_unit_id) DO NOTHING;
