-- CRM: allowlist công ty SX hiển thị theo công ty CRM + liên kết loại CRM → phân loại SX.
-- Allowlist rỗng (không có dòng) = hiện tất cả công ty module Sản xuất.

CREATE TABLE IF NOT EXISTS crm_company_visible_production_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crm_company_id, production_company_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_vis_sx_crm_co
  ON crm_company_visible_production_companies (crm_company_id);

CREATE INDEX IF NOT EXISTS idx_crm_vis_sx_prod_co
  ON crm_company_visible_production_companies (production_company_id);

COMMENT ON TABLE crm_company_visible_production_companies IS
  'Công ty SX được hiện khi chọn xưởng cho deal của công ty CRM. Không có dòng = hiện tất cả module Sản xuất.';

ALTER TABLE crm_company_visible_production_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_vis_sx_all" ON crm_company_visible_production_companies;
CREATE POLICY "crm_vis_sx_all" ON crm_company_visible_production_companies FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE crm_lead_types
  ADD COLUMN IF NOT EXISTS default_workshop_type_id UUID REFERENCES workshop_project_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_lead_types_default_workshop_type_idx
  ON crm_lead_types (default_workshop_type_id)
  WHERE default_workshop_type_id IS NOT NULL;

COMMENT ON COLUMN crm_lead_types.default_workshop_type_id IS
  'Phân loại xưởng (workshop_project_types) mặc định gắn với loại CRM — thuộc default_production_company_id.';
