-- 472: Tăng tốc tìm kiếm CRM dạng ILIKE '%từ khóa%'.
-- Các RPC Kanban luôn lọc parent_lead_id IS NULL nên index crm_leads dùng cùng predicate.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_crm_leads_search_title_trgm
  ON public.crm_leads USING gin (title gin_trgm_ops)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_search_code_trgm
  ON public.crm_leads USING gin (code gin_trgm_ops)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_search_phone_trgm
  ON public.crm_leads USING gin ((COALESCE(phone::text, '')) gin_trgm_ops)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_search_description_trgm
  ON public.crm_leads USING gin ((COALESCE(description::text, '')) gin_trgm_ops)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_search_install_address_trgm
  ON public.crm_leads USING gin ((COALESCE(install_address::text, '')) gin_trgm_ops)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_customers_search_phone_trgm
  ON public.customers USING gin ((COALESCE(phone::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_customers_search_name_trgm
  ON public.customers USING gin ((COALESCE(full_name::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_customers_search_email_trgm
  ON public.customers USING gin ((COALESCE(email::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_customers_search_address_trgm
  ON public.customers USING gin ((COALESCE(address::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_customers_search_company_trgm
  ON public.customers USING gin ((COALESCE(company::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_users_search_full_name_trgm
  ON public.users USING gin ((COALESCE(full_name::text, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_crm_sources_search_name_trgm
  ON public.crm_sources USING gin ((COALESCE(name::text, '')) gin_trgm_ops);

ANALYZE public.crm_leads;
ANALYZE public.customers;
ANALYZE public.users;
ANALYZE public.crm_sources;
