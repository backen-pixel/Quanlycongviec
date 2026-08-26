-- 577: Business OS Sales — Production -> delivery ready -> Installation -> completed.
--
-- projects, crm_lead_comments and logistics_pipeline_stages remain the domain
-- Systems of Record. The process kernel stores only lifecycle milestones and
-- stable references used by the cross-module timeline, audit and KPI.

BEGIN;

ALTER TABLE business_os_process_instances
  ADD COLUMN IF NOT EXISTS delivery_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_ready_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logistics_handover_comment_id BIGINT REFERENCES crm_lead_comments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS installation_started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS installation_completed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE business_os_process_instances
  DROP CONSTRAINT IF EXISTS business_os_process_instances_sales_stage_ck;

ALTER TABLE business_os_process_instances
  ADD CONSTRAINT business_os_process_instances_sales_stage_ck
  CHECK (
    process_key <> 'sales_lead_qualification_v1'
    OR current_stage_key IN (
      'lead', 'qualification', 'qualified', 'deal',
      'survey', 'design', 'design_review', 'design_completed',
      'quotation', 'negotiation', 'order_ready', 'order',
      'project', 'production', 'delivery_ready', 'installation', 'completed'
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_installation_project
  ON business_os_process_instances (company_id, installation_project_id)
  WHERE installation_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_installation_company
  ON business_os_process_instances (company_id, installation_company_id)
  WHERE installation_company_id IS NOT NULL;

COMMENT ON COLUMN business_os_process_instances.delivery_ready_at IS
  'First persisted Production request to hand the project over to logistics/installation.';
COMMENT ON COLUMN business_os_process_instances.logistics_handover_comment_id IS
  'Interactive CRM handover card; crm_lead_comments remains the handover SoR.';
COMMENT ON COLUMN business_os_process_instances.installation_started_at IS
  'First successful Sale selection of logistics company/external installer and schedule.';
COMMENT ON COLUMN business_os_process_instances.installation_project_id IS
  'Project handled by the logistics/installation module for this process.';
COMMENT ON COLUMN business_os_process_instances.installation_completed_at IS
  'First transition of the installation project into a completed logistics column.';

COMMIT;
