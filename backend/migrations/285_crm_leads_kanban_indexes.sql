-- Index hỗ trợ crm_leads_page_ids + crm_leads_stage_counts (Kanban mobile/web).

CREATE INDEX IF NOT EXISTS idx_crm_leads_kanban_type_company_stage
  ON public.crm_leads (type, company_id, stage_id)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_kanban_assigned
  ON public.crm_leads (type, company_id, assigned_to)
  WHERE parent_lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_kanban_owner
  ON public.crm_leads (type, company_id, lead_owner_id)
  WHERE parent_lead_id IS NULL;
