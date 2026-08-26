-- 572: Flexible Deal routing when the customer already has a design.
--
-- A customer-provided design is not allowed to bypass quality control. It uses
-- a dedicated review stage, with its own tasks/SLA, before quotation readiness.

BEGIN;

ALTER TABLE business_os_process_instances
  ADD COLUMN IF NOT EXISTS workflow_path TEXT,
  ADD COLUMN IF NOT EXISTS design_review_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_review_completed_at TIMESTAMPTZ;

ALTER TABLE business_os_process_instances
  DROP CONSTRAINT IF EXISTS business_os_process_instances_workflow_path_ck;

ALTER TABLE business_os_process_instances
  ADD CONSTRAINT business_os_process_instances_workflow_path_ck
  CHECK (
    workflow_path IS NULL
    OR workflow_path IN ('full_service', 'customer_design')
  );

ALTER TABLE business_os_process_instances
  DROP CONSTRAINT IF EXISTS business_os_process_instances_sales_stage_ck;

ALTER TABLE business_os_process_instances
  ADD CONSTRAINT business_os_process_instances_sales_stage_ck
  CHECK (
    process_key <> 'sales_lead_qualification_v1'
    OR current_stage_key IN (
      'lead', 'qualification', 'qualified', 'deal',
      'survey', 'design', 'design_review', 'design_completed'
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_workflow_path
  ON business_os_process_instances (company_id, process_key, workflow_path, current_stage_key)
  WHERE workflow_path IS NOT NULL;

COMMENT ON COLUMN business_os_process_instances.workflow_path IS
  'Nhánh Deal đã chọn: full_service hoặc customer_design.';
COMMENT ON COLUMN business_os_process_instances.design_review_started_at IS
  'Mốc bắt đầu kiểm tra thiết kế do khách hàng cung cấp.';
COMMENT ON COLUMN business_os_process_instances.design_review_completed_at IS
  'Mốc thiết kế khách cung cấp đã qua gate kỹ thuật và đủ dữ liệu báo giá.';

COMMIT;
