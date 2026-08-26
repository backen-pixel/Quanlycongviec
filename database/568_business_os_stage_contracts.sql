-- 568_business_os_stage_contracts.sql
-- Stage Contract cấu hình theo công ty cho Business OS.

BEGIN;

CREATE TABLE IF NOT EXISTS business_os_stage_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  schema_version INT NOT NULL DEFAULT 1,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  optional_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_stage_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_stage_contracts_scope_uq
    UNIQUE (company_id, process_key, stage_key),
  CONSTRAINT business_os_stage_contracts_required_array_ck
    CHECK (jsonb_typeof(required_fields) = 'array'),
  CONSTRAINT business_os_stage_contracts_optional_array_ck
    CHECK (jsonb_typeof(optional_fields) = 'array'),
  CONSTRAINT business_os_stage_contracts_task_slugs_array_ck
    CHECK (jsonb_typeof(task_stage_slugs) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_business_os_stage_contracts_company_process
  ON business_os_stage_contracts (company_id, process_key, stage_key)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_business_os_stage_contracts_updated_at
  ON business_os_stage_contracts;
CREATE TRIGGER trg_business_os_stage_contracts_updated_at
  BEFORE UPDATE ON business_os_stage_contracts
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

ALTER TABLE business_os_stage_contracts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE business_os_stage_contracts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_stage_contracts TO service_role;

COMMENT ON TABLE business_os_stage_contracts IS
  'Stage Contract theo company: trường bắt buộc, tùy chọn và task gate của từng process stage.';

COMMIT;
