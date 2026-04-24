-- Migration 95: Phân loại Lead/Deal theo công ty (company-scoped types)

CREATE TABLE IF NOT EXISTS crm_lead_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('lead','deal','both')),
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Avoid duplicates per company
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_types_company_name_uq
  ON crm_lead_types (company_id, lower(name));

CREATE INDEX IF NOT EXISTS crm_lead_types_company_active_idx
  ON crm_lead_types (company_id, is_active, order_index);

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS lead_type_id UUID REFERENCES crm_lead_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_leads_lead_type_idx
  ON crm_leads (lead_type_id);

COMMENT ON TABLE crm_lead_types IS 'Danh mục phân loại Lead/Deal theo từng công ty';
COMMENT ON COLUMN crm_leads.lead_type_id IS 'Loại Lead/Deal (company-scoped)';
