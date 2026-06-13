-- Index hỗ trợ crm_leads_page_ids + crm_leads_stage_counts (Kanban mobile/web).
-- CHẠY TRÊN Supabase project production (có bảng crm_leads), ví dụ: kdxypztstbeovyedmvem.supabase.co
-- KHÔNG chạy trên project trống / dev chưa migrate CRM.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_leads'
  ) THEN
    RAISE EXCEPTION
      'SAI SUPABASE PROJECT: bảng public.crm_leads không tồn tại trên database "%". '
      || 'Backend CRM dùng project kdxypztstbeovyedmvem — mở SQL Editor tại '
      || 'https://supabase.com/dashboard/project/kdxypztstbeovyedmvem/sql/new',
      current_database();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_leads_kanban_type_company_stage
  ON public.crm_leads (type, company_id, stage_id)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_kanban_assigned
  ON public.crm_leads (type, company_id, assigned_to)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_kanban_owner
  ON public.crm_leads (type, company_id, lead_owner_id)
  WHERE parent_lead_id IS NULL;
