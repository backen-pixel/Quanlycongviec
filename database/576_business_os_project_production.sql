-- 576: Business OS Sales — confirmed Order -> Project -> Production handover.
--
-- projects remains the Project / Production System of Record. The process
-- kernel stores only lifecycle milestones and stable references for gates,
-- audit and KPI.

BEGIN;

ALTER TABLE business_os_process_instances
  ADD COLUMN IF NOT EXISTS project_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS project_started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS production_started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS production_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

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
      'project', 'production'
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_primary_project
  ON business_os_process_instances (company_id, primary_project_id)
  WHERE primary_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_production_project
  ON business_os_process_instances (company_id, production_project_id)
  WHERE production_project_id IS NOT NULL;

COMMENT ON COLUMN business_os_process_instances.project_started_at IS
  'First confirmed-order project milestone for this process.';
COMMENT ON COLUMN business_os_process_instances.primary_project_id IS
  'Primary project created or linked from the confirmed order; projects remains the SoR.';
COMMENT ON COLUMN business_os_process_instances.production_started_at IS
  'First successful explicit Sale-to-Production handover milestone.';
COMMENT ON COLUMN business_os_process_instances.production_project_id IS
  'Project selected in the successful Production handover.';
COMMENT ON COLUMN business_os_process_instances.production_company_id IS
  'Production company selected in the successful handover.';

COMMIT;
