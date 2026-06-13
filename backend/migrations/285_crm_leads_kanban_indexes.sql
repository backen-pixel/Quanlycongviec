-- Index hỗ trợ crm_leads_page_ids + crm_leads_stage_counts (Kanban mobile/web).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_leads'
  ) THEN
    RAISE EXCEPTION
      'Bảng public.crm_leads chưa tồn tại — chạy trên Supabase project SAI hoặc chưa migrate CRM (19_crm_sales.sql).';
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
