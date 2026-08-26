-- 571: Business OS vertical slice Deal -> Survey -> Design.
--
-- Giữ crm_leads/crm_tasks làm nguồn dữ liệu nghiệp vụ duy nhất. Migration này
-- chỉ mở rộng process kernel, mốc thời gian và khóa chống lặp SLA theo stage.

BEGIN;

ALTER TABLE business_os_process_instances
  ADD COLUMN IF NOT EXISTS survey_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_completed_at TIMESTAMPTZ;

ALTER TABLE business_os_process_instances
  DROP CONSTRAINT IF EXISTS business_os_process_instances_sales_stage_ck;

ALTER TABLE business_os_process_instances
  ADD CONSTRAINT business_os_process_instances_sales_stage_ck
  CHECK (
    process_key <> 'sales_lead_qualification_v1'
    OR current_stage_key IN (
      'lead', 'qualification', 'qualified', 'deal',
      'survey', 'design', 'design_completed'
    )
  );

ALTER TABLE business_os_sla_escalations
  ADD COLUMN IF NOT EXISTS stage_key TEXT;

UPDATE business_os_sla_escalations
SET stage_key = COALESCE(NULLIF(stage_key, ''), metadata ->> 'stage_key', 'qualification')
WHERE stage_key IS NULL OR stage_key = '';

ALTER TABLE business_os_sla_escalations
  ALTER COLUMN stage_key SET NOT NULL;

ALTER TABLE business_os_sla_escalations
  DROP CONSTRAINT IF EXISTS business_os_sla_escalations_dedupe_uq;

ALTER TABLE business_os_sla_escalations
  ADD CONSTRAINT business_os_sla_escalations_dedupe_uq
  UNIQUE (process_instance_id, stage_key, level, recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_business_os_sla_escalations_stage
  ON business_os_sla_escalations (company_id, stage_key, created_at DESC);

COMMENT ON COLUMN business_os_process_instances.survey_started_at IS
  'Mốc Deal bắt đầu Khảo sát trong Business OS.';
COMMENT ON COLUMN business_os_process_instances.survey_completed_at IS
  'Mốc hoàn tất task gate Khảo sát và bàn giao sang Thiết kế.';
COMMENT ON COLUMN business_os_process_instances.design_started_at IS
  'Mốc bắt đầu Thiết kế sau khi hồ sơ Khảo sát đạt gate.';
COMMENT ON COLUMN business_os_process_instances.design_completed_at IS
  'Mốc hồ sơ Thiết kế sẵn sàng cho lát cắt Báo giá tiếp theo.';
COMMENT ON COLUMN business_os_sla_escalations.stage_key IS
  'Stage phát sinh cảnh báo; cho phép cùng process instance được cảnh báo độc lập theo từng stage.';

COMMIT;
