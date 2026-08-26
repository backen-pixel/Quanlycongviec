-- 473_business_os_sales_qualification_pilot.sql
-- Kernel tối thiểu cho vertical slice Lead → Qualification → Deal.
-- Không tự bật tenant nào. Pilot được bật riêng bằng app_settings
-- key business_os_sales_pilot_v1 sau khi staging sẵn sàng.

BEGIN;

CREATE TABLE IF NOT EXISTS business_os_process_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  process_version INT NOT NULL DEFAULT 1,
  record_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  current_stage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_started_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  qualified_at TIMESTAMPTZ,
  qualified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_process_instances_record_uq
    UNIQUE (company_id, process_key, record_type, record_id),
  CONSTRAINT business_os_process_instances_status_ck
    CHECK (status IN ('active', 'completed', 'cancelled')),
  CONSTRAINT business_os_process_instances_sales_stage_ck
    CHECK (
      process_key <> 'sales_lead_qualification_v1'
      OR current_stage_key IN ('lead', 'qualification', 'qualified', 'deal')
    )
);

CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_company_stage
  ON business_os_process_instances (company_id, process_key, current_stage_key, status);
CREATE INDEX IF NOT EXISTS idx_business_os_process_instances_sla
  ON business_os_process_instances (company_id, sla_due_at)
  WHERE status = 'active' AND sla_due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS business_os_process_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_instance_id UUID NOT NULL REFERENCES business_os_process_instances(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_stage_key TEXT,
  to_stage_key TEXT,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  CONSTRAINT business_os_process_events_idempotency_uq
    UNIQUE (company_id, process_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_business_os_process_events_instance_time
  ON business_os_process_events (process_instance_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_os_process_events_outbox
  ON business_os_process_events (published_at, occurred_at)
  WHERE published_at IS NULL;

CREATE OR REPLACE FUNCTION business_os_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_os_process_instances_updated_at
  ON business_os_process_instances;
CREATE TRIGGER trg_business_os_process_instances_updated_at
  BEFORE UPDATE ON business_os_process_instances
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

ALTER TABLE business_os_process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_os_process_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE business_os_process_instances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE business_os_process_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_process_instances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_process_events TO service_role;

REVOKE ALL ON FUNCTION business_os_set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION business_os_set_updated_at() TO service_role;

COMMENT ON TABLE business_os_process_instances IS
  'Business OS process kernel. Pilot đầu tiên dùng process_key sales_lead_qualification_v1 và adapter crm_leads.';
COMMENT ON TABLE business_os_process_events IS
  'Event ledger + command receipt cho chuyển trạng thái Business OS; idempotency_key chống thực thi lặp.';
COMMENT ON COLUMN business_os_process_instances.record_id IS
  'ID mềm của bản ghi domain; với sales_lead_qualification_v1 là crm_leads.id.';
COMMENT ON COLUMN business_os_process_instances.sla_due_at IS
  'Deadline Qualification tính theo lịch giờ làm việc KPI của công ty.';

COMMIT;
