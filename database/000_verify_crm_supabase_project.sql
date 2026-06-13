-- Chạy TRƯỚC migration 326/327 — xác nhận đúng Supabase project.
-- Backend + app CRM dùng project: kdxypztstbeovyedmvem
-- URL: https://kdxypztstbeovyedmvem.supabase.co

SELECT
  current_database() AS db,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_leads'
  ) AS crm_leads_exists,
  (
    SELECT COUNT(*)::bigint FROM public.crm_leads
  ) AS crm_leads_rows
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'crm_leads'
);

-- Nếu query trên báo lỗi "crm_leads does not exist" → SAI PROJECT.
-- Mở SQL Editor đúng project:
-- https://supabase.com/dashboard/project/kdxypztstbeovyedmvem/sql/new
