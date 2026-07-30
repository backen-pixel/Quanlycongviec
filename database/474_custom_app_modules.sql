-- 474: Khuôn mẫu module tùy chỉnh (generic)
-- Registry + pipeline + records + tasks/templates + liên kết stage → module

BEGIN;

-- 1) Registry module tùy chỉnh
CREATE TABLE IF NOT EXISTS app_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  icon VARCHAR(40),
  color VARCHAR(32) DEFAULT '#4f46e5',
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_modules_module_key_format CHECK (module_key ~ '^[a-z][a-z0-9_]{1,62}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_modules_module_key
  ON app_modules (LOWER(module_key));

CREATE INDEX IF NOT EXISTS idx_app_modules_active ON app_modules(is_active);
CREATE INDEX IF NOT EXISTS idx_app_modules_company ON app_modules(company_id);

ALTER TABLE app_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_modules" ON app_modules;
CREATE POLICY "service_all_app_modules" ON app_modules FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE app_modules IS 'Registry module tùy chỉnh (generic) — không gắn nghiệp vụ cố định.';
COMMENT ON COLUMN app_modules.module_key IS 'Slug unique dùng cho route /m/:moduleKey và ecosystem_module_scopes.';
COMMENT ON COLUMN app_modules.company_id IS 'NULL = toàn hệ thống; có giá trị = giới hạn công ty.';

-- 2) Pipeline stages của module
CREATE TABLE IF NOT EXISTS app_module_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#4f46e5',
  icon TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  bucket_slug TEXT,
  crm_target_stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_module_stages_module
  ON app_module_pipeline_stages(module_id, order_index);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_module_stages_bucket
  ON app_module_pipeline_stages(module_id, bucket_slug)
  WHERE bucket_slug IS NOT NULL;

ALTER TABLE app_module_pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_pipeline_stages" ON app_module_pipeline_stages;
CREATE POLICY "service_all_app_module_pipeline_stages" ON app_module_pipeline_stages FOR ALL USING (true) WITH CHECK (true);

COMMENT ON COLUMN app_module_pipeline_stages.crm_target_stage_id IS
  'Khi record vào cột này → đẩy CRM deal (source_crm_lead_id) sang stage này.';

-- 3) Records (công việc / thẻ Kanban của module)
CREATE TABLE IF NOT EXISTS app_module_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stage_id UUID REFERENCES app_module_pipeline_stages(id) ON DELETE SET NULL,
  source_crm_lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_module_records_module_stage
  ON app_module_records(module_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_app_module_records_company
  ON app_module_records(company_id);

CREATE INDEX IF NOT EXISTS idx_app_module_records_lead
  ON app_module_records(source_crm_lead_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_module_records_module_lead
  ON app_module_records(module_id, source_crm_lead_id)
  WHERE source_crm_lead_id IS NOT NULL;

ALTER TABLE app_module_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_records" ON app_module_records;
CREATE POLICY "service_all_app_module_records" ON app_module_records FOR ALL USING (true) WITH CHECK (true);

-- 4) Task templates
CREATE TABLE IF NOT EXISTS app_module_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES app_module_pipeline_stages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_module_task_tpl_module
  ON app_module_task_templates(module_id, order_index);

CREATE TABLE IF NOT EXISTS app_module_task_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES app_module_task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  deadline_days INT DEFAULT 0,
  order_index INT DEFAULT 0,
  checklist JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_module_task_tpl_items
  ON app_module_task_template_items(template_id, order_index);

ALTER TABLE app_module_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_module_task_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_app_module_task_templates" ON app_module_task_templates;
CREATE POLICY "service_all_app_module_task_templates" ON app_module_task_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_app_module_task_template_items" ON app_module_task_template_items;
CREATE POLICY "service_all_app_module_task_template_items" ON app_module_task_template_items FOR ALL USING (true) WITH CHECK (true);

-- 5) Tasks trên record
CREATE TABLE IF NOT EXISTS app_module_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES app_module_records(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deadline TIMESTAMPTZ,
  checklist JSONB DEFAULT '[]'::jsonb,
  order_index INT DEFAULT 0,
  template_item_id UUID REFERENCES app_module_task_template_items(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_module_tasks_record
  ON app_module_tasks(record_id, order_index);

CREATE INDEX IF NOT EXISTS idx_app_module_tasks_module
  ON app_module_tasks(module_id);

ALTER TABLE app_module_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_tasks" ON app_module_tasks;
CREATE POLICY "service_all_app_module_tasks" ON app_module_tasks FOR ALL USING (true) WITH CHECK (true);

-- 6) Liên kết stage module nguồn → module đích (transfer / notify)
CREATE TABLE IF NOT EXISTS pipeline_stage_module_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('crm', 'production', 'logistics', 'custom')),
  source_stage_id UUID NOT NULL,
  target_module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL CHECK (link_type IN ('transfer', 'notify')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_kind, source_stage_id, target_module_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_psml_source
  ON pipeline_stage_module_links(source_kind, source_stage_id)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_psml_target
  ON pipeline_stage_module_links(target_module_id);

ALTER TABLE pipeline_stage_module_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_pipeline_stage_module_links" ON pipeline_stage_module_links;
CREATE POLICY "service_all_pipeline_stage_module_links" ON pipeline_stage_module_links FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE pipeline_stage_module_links IS
  'Liên kết generic: stage CRM/SX/VC/custom → module tùy chỉnh (transfer | notify).';

-- Cập nhật comment ecosystem scopes (module_key free-form + custom keys)
COMMENT ON COLUMN ecosystem_module_scopes.module_key IS
  'crm | production | logistics | projects | tasks | customers | tinhtoan | accounting | purchasing | <app_modules.module_key>';

COMMIT;
