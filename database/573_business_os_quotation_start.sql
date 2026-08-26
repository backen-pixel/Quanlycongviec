-- 573: Business OS Sales — nối Design completed -> Quotation bằng chứng từ CRM thật.
--
-- quotations vẫn là System of Record. Process kernel chỉ giữ mốc chuyển bước
-- và tham chiếu báo giá đầu tiên để audit/KPI, không sao chép nội dung báo giá.

BEGIN;

ALTER TABLE business_os_process_instances
  ADD COLUMN IF NOT EXISTS quotation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quotation_started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL;

ALTER TABLE business_os_process_instances
  DROP CONSTRAINT IF EXISTS business_os_process_instances_sales_stage_ck;

ALTER TABLE business_os_process_instances
  ADD CONSTRAINT business_os_process_instances_sales_stage_ck
  CHECK (
    process_key <> 'sales_lead_qualification_v1'
    OR current_stage_key IN (
      'lead', 'qualification', 'qualified', 'deal',
      'survey', 'design', 'design_review', 'design_completed',
      'quotation'
    )
  );

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_primary_quotation
  ON business_os_process_instances (company_id, primary_quotation_id)
  WHERE primary_quotation_id IS NOT NULL;

COMMENT ON COLUMN business_os_process_instances.quotation_started_at IS
  'Mốc tạo báo giá CRM đầu tiên sau khi hồ sơ thiết kế đạt gate.';
COMMENT ON COLUMN business_os_process_instances.quotation_started_by IS
  'Người tạo báo giá đầu tiên làm process chuyển sang Quotation.';
COMMENT ON COLUMN business_os_process_instances.primary_quotation_id IS
  'Tham chiếu báo giá CRM đầu tiên của process; không sao chép dữ liệu báo giá.';

COMMIT;
