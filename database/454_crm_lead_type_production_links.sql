-- 1 loại CRM ↔ nhiều cặp (công ty SX + phân loại SX)

CREATE TABLE IF NOT EXISTS crm_lead_type_production_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_type_id UUID NOT NULL REFERENCES crm_lead_types(id) ON DELETE CASCADE,
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workshop_type_id UUID NOT NULL REFERENCES workshop_project_types(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_type_id, production_company_id, workshop_type_id)
);

CREATE INDEX IF NOT EXISTS idx_cltpl_lead_type
  ON crm_lead_type_production_links (lead_type_id);

CREATE INDEX IF NOT EXISTS idx_cltpl_prod_co
  ON crm_lead_type_production_links (production_company_id);

COMMENT ON TABLE crm_lead_type_production_links IS
  'Liên kết loại CRM với nhiều công ty SX + phân loại xưởng. is_primary = gợi ý ★ ưu tiên / sync default_* trên crm_lead_types.';

ALTER TABLE crm_lead_type_production_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cltpl_all" ON crm_lead_type_production_links;
CREATE POLICY "cltpl_all" ON crm_lead_type_production_links FOR ALL USING (true) WITH CHECK (true);

-- Backfill từ default_production_company_id + default_workshop_type_id (chỉ khi có đủ cả hai)
INSERT INTO crm_lead_type_production_links (
  lead_type_id, production_company_id, workshop_type_id, is_primary, order_index
)
SELECT
  lt.id,
  lt.default_production_company_id,
  lt.default_workshop_type_id,
  true,
  0
FROM crm_lead_types lt
WHERE lt.default_production_company_id IS NOT NULL
  AND lt.default_workshop_type_id IS NOT NULL
ON CONFLICT (lead_type_id, production_company_id, workshop_type_id) DO NOTHING;

-- Trường hợp chỉ có công ty SX mặc định: bỏ qua (cần phân loại để hợp lệ)
