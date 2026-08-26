-- 569_business_os_dynamic_custom_fields.sql
-- Dynamic Custom Fields + version history cho Business OS Stage Contract.

BEGIN;

CREATE TABLE IF NOT EXISTS business_os_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'crm_lead',
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  default_mode TEXT NOT NULL DEFAULT 'optional',
  placeholder TEXT,
  help_text TEXT,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_index INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_custom_field_definitions_scope_uq
    UNIQUE (company_id, process_key, stage_key, entity_type, field_key),
  CONSTRAINT business_os_custom_field_definitions_key_ck
    CHECK (field_key ~ '^custom_[a-z0-9_]{2,56}$'),
  CONSTRAINT business_os_custom_field_definitions_type_ck
    CHECK (field_type IN ('text', 'textarea', 'number', 'date', 'select', 'boolean')),
  CONSTRAINT business_os_custom_field_definitions_mode_ck
    CHECK (default_mode IN ('required', 'optional', 'hidden')),
  CONSTRAINT business_os_custom_field_definitions_options_ck
    CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT business_os_custom_field_definitions_validation_ck
    CHECK (jsonb_typeof(validation) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_business_os_custom_fields_company_stage
  ON business_os_custom_field_definitions
  (company_id, process_key, stage_key, entity_type, order_index)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_business_os_custom_field_definitions_updated_at
  ON business_os_custom_field_definitions;
CREATE TRIGGER trg_business_os_custom_field_definitions_updated_at
  BEFORE UPDATE ON business_os_custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

CREATE TABLE IF NOT EXISTS business_os_custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL
    REFERENCES business_os_custom_field_definitions(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL DEFAULT 'crm_lead',
  record_id UUID NOT NULL,
  value JSONB NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_custom_field_values_record_uq
    UNIQUE (field_definition_id, record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_business_os_custom_field_values_record
  ON business_os_custom_field_values (company_id, record_type, record_id);

DROP TRIGGER IF EXISTS trg_business_os_custom_field_values_updated_at
  ON business_os_custom_field_values;
CREATE TRIGGER trg_business_os_custom_field_values_updated_at
  BEFORE UPDATE ON business_os_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION business_os_set_updated_at();

CREATE TABLE IF NOT EXISTS business_os_stage_contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL
    REFERENCES business_os_stage_contracts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  version INT NOT NULL,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  optional_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_stage_slugs JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_field_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_type TEXT NOT NULL DEFAULT 'update',
  source_version INT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_os_stage_contract_versions_uq
    UNIQUE (contract_id, version),
  CONSTRAINT business_os_stage_contract_versions_required_ck
    CHECK (jsonb_typeof(required_fields) = 'array'),
  CONSTRAINT business_os_stage_contract_versions_optional_ck
    CHECK (jsonb_typeof(optional_fields) = 'array'),
  CONSTRAINT business_os_stage_contract_versions_task_slugs_ck
    CHECK (jsonb_typeof(task_stage_slugs) = 'array'),
  CONSTRAINT business_os_stage_contract_versions_custom_snapshot_ck
    CHECK (jsonb_typeof(custom_field_snapshot) = 'array'),
  CONSTRAINT business_os_stage_contract_versions_change_type_ck
    CHECK (change_type IN ('seed', 'update', 'custom_field_created', 'custom_field_removed', 'rollback'))
);

CREATE INDEX IF NOT EXISTS idx_business_os_stage_contract_versions_scope
  ON business_os_stage_contract_versions (company_id, process_key, stage_key, version DESC);

INSERT INTO business_os_stage_contract_versions (
  contract_id,
  company_id,
  process_key,
  stage_key,
  version,
  required_fields,
  optional_fields,
  task_stage_slugs,
  custom_field_snapshot,
  change_type,
  created_by,
  created_at
)
SELECT
  c.id,
  c.company_id,
  c.process_key,
  c.stage_key,
  c.version,
  c.required_fields,
  c.optional_fields,
  c.task_stage_slugs,
  '[]'::jsonb,
  'seed',
  COALESCE(c.updated_by, c.created_by),
  c.updated_at
FROM business_os_stage_contracts c
ON CONFLICT (contract_id, version) DO NOTHING;

ALTER TABLE business_os_custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_os_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_os_stage_contract_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE business_os_custom_field_definitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE business_os_custom_field_values FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE business_os_stage_contract_versions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_custom_field_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_custom_field_values TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_os_stage_contract_versions TO service_role;

COMMENT ON TABLE business_os_custom_field_definitions IS
  'Định nghĩa Dynamic Custom Fields theo company/process/stage; không thay đổi schema crm_leads.';
COMMENT ON TABLE business_os_custom_field_values IS
  'Giá trị trường tùy biến gắn với record thật; company scope và audit qua API.';
COMMENT ON TABLE business_os_stage_contract_versions IS
  'Snapshot bất biến phục vụ xem lịch sử và rollback Stage Contract.';

COMMIT;
