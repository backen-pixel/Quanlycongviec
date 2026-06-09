-- 301: Tên công ty bên ngoài trên deal (B2B / đối tác ngoài hệ thống)

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS external_company_name TEXT;

COMMENT ON COLUMN crm_leads.external_company_name IS
  'Tên công ty đối tác / khách B2B ngoài hệ thống — nhập tay khi tạo deal SX.';
