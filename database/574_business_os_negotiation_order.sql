-- 574: Business OS Sales — Quotation -> Negotiation -> Order ready -> Order.
--
-- quotations / orders remain Systems of Record. The process kernel stores only
-- milestone timestamps and stable references used for stage gates, audit and KPI.

BEGIN;

ALTER TABLE business_os_process_instances
  ADD COLUMN IF NOT EXISTS negotiation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS negotiation_started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quotation_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quotation_accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS order_started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE business_os_process_instances
  DROP CONSTRAINT IF EXISTS business_os_process_instances_sales_stage_ck;

ALTER TABLE business_os_process_instances
  ADD CONSTRAINT business_os_process_instances_sales_stage_ck
  CHECK (
    process_key <> 'sales_lead_qualification_v1'
    OR current_stage_key IN (
      'lead', 'qualification', 'qualified', 'deal',
      'survey', 'design', 'design_review', 'design_completed',
      'quotation', 'negotiation', 'order_ready', 'order'
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_accepted_quotation
  ON business_os_process_instances (company_id, accepted_quotation_id)
  WHERE accepted_quotation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_primary_order
  ON business_os_process_instances (company_id, primary_order_id)
  WHERE primary_order_id IS NOT NULL;

COMMENT ON COLUMN business_os_process_instances.negotiation_started_at IS
  'First commercial negotiation milestone, normally when a CRM quotation is sent.';
COMMENT ON COLUMN business_os_process_instances.quotation_accepted_at IS
  'First time a CRM quotation is accepted for this process.';
COMMENT ON COLUMN business_os_process_instances.accepted_quotation_id IS
  'Accepted CRM quotation proving the Order-ready gate; quotation remains the SoR.';
COMMENT ON COLUMN business_os_process_instances.order_started_at IS
  'First real CRM order creation milestone for this process.';
COMMENT ON COLUMN business_os_process_instances.primary_order_id IS
  'First CRM order linked to this process; order remains the SoR.';

COMMIT;
