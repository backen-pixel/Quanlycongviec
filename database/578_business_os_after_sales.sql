-- 578: Business OS Customer Care / Warranty.
--
-- Sales remains completed after installation handover. A separate process
-- instance (customer_after_sales_v1, record_type=project) owns recurring care
-- and warranty work. crm_tasks stays the executable task System of Record;
-- this migration only adds the missing warranty/service case ledger.

BEGIN;

CREATE TABLE IF NOT EXISTS business_os_customer_service_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_instance_id UUID NOT NULL
    REFERENCES business_os_process_instances(id) ON DELETE CASCADE,
  case_code TEXT NOT NULL,
  case_type TEXT NOT NULL DEFAULT 'warranty',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  resolution TEXT,
  deal_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  source_event_id UUID REFERENCES crm_events(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_customer_service_cases_code_uq
    UNIQUE (company_id, case_code),
  CONSTRAINT business_os_customer_service_cases_type_ck
    CHECK (case_type IN ('warranty', 'service', 'complaint')),
  CONSTRAINT business_os_customer_service_cases_priority_ck
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT business_os_customer_service_cases_status_ck
    CHECK (status IN ('open', 'triaged', 'in_progress', 'resolved', 'closed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_business_os_customer_cases_company_status
  ON business_os_customer_service_cases (company_id, status, sla_due_at);
CREATE INDEX IF NOT EXISTS idx_business_os_customer_cases_process
  ON business_os_customer_service_cases (process_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_os_customer_cases_project
  ON business_os_customer_service_cases (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_os_after_sales_instances
  ON business_os_process_instances (company_id, process_key, record_id, status)
  WHERE process_key = 'customer_after_sales_v1' AND record_type = 'project';

DROP TRIGGER IF EXISTS trg_business_os_customer_service_cases_updated_at
  ON business_os_customer_service_cases;
CREATE TRIGGER trg_business_os_customer_service_cases_updated_at
  BEFORE UPDATE ON business_os_customer_service_cases
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

ALTER TABLE business_os_customer_service_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE business_os_customer_service_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE business_os_customer_service_cases TO service_role;

COMMENT ON TABLE business_os_customer_service_cases IS
  'Warranty/service/complaint cases for the separate after-sales process. Multiple cases may belong to one installed project.';
COMMENT ON COLUMN business_os_customer_service_cases.sla_due_at IS
  'First-response/resolution target calculated by backend business-hours policy from priority.';
COMMENT ON COLUMN business_os_customer_service_cases.process_instance_id IS
  'References customer_after_sales_v1; the Sales process is never reopened for warranty work.';

COMMIT;
