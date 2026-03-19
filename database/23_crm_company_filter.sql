-- 23: Add company_id to crm_leads for filtering by company (pipeline per company)
ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_crm_leads_company_id ON crm_leads(company_id);
