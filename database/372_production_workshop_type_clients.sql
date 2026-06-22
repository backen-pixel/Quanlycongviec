-- Phân loại xưởng (workshop_project_types) gắn công ty CRM đặt hàng.
-- Không có dòng → mọi khách ngoài đều thấy. Có dòng → chỉ client_company_id trong danh sách.

CREATE TABLE IF NOT EXISTS production_workshop_type_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workshop_type_id UUID NOT NULL REFERENCES workshop_project_types(id) ON DELETE CASCADE,
  client_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (production_company_id, workshop_type_id, client_company_id)
);

CREATE INDEX IF NOT EXISTS idx_pwtc_workshop_type
  ON production_workshop_type_clients (workshop_type_id);
CREATE INDEX IF NOT EXISTS idx_pwtc_client
  ON production_workshop_type_clients (client_company_id);

COMMENT ON TABLE production_workshop_type_clients IS
  'Phân loại xưởng chỉ hiển thị cho công ty CRM đặt hàng được liệt kê; type không có dòng = mọi khách.';

ALTER TABLE production_workshop_type_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pwtc_all" ON production_workshop_type_clients;
CREATE POLICY "pwtc_all" ON production_workshop_type_clients FOR ALL USING (true) WITH CHECK (true);

-- Backfill từ deal SX hiện có (deal CRM ≠ xưởng SX).
INSERT INTO production_workshop_type_clients (production_company_id, workshop_type_id, client_company_id)
SELECT DISTINCT
  p.company_id,
  p.workshop_type_id,
  COALESCE(cl.external_company_id, cl.company_id) AS client_company_id
FROM projects p
INNER JOIN crm_leads cl ON cl.project_id = p.id AND cl.type = 'deal'
WHERE p.workshop_type_id IS NOT NULL
  AND p.company_id IS NOT NULL
  AND COALESCE(cl.external_company_id, cl.company_id) IS NOT NULL
  AND COALESCE(cl.external_company_id, cl.company_id) <> p.company_id
ON CONFLICT (production_company_id, workshop_type_id, client_company_id) DO NOTHING;
