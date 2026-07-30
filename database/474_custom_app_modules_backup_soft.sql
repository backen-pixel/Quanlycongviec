-- Soft apply for backup DB (avoid FK to users if PK missing)
BEGIN;

CREATE TABLE IF NOT EXISTS app_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  icon VARCHAR(40),
  color VARCHAR(32) DEFAULT '#4f46e5',
  company_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_modules_module_key ON app_modules (LOWER(module_key));
CREATE INDEX IF NOT EXISTS idx_app_modules_active ON app_modules(is_active);
ALTER TABLE app_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_modules" ON app_modules;
CREATE POLICY "service_all_app_modules" ON app_modules FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app_module_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#4f46e5',
  icon TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  bucket_slug TEXT,
  crm_target_stage_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_module_stages_module ON app_module_pipeline_stages(module_id, order_index);
ALTER TABLE app_module_pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_pipeline_stages" ON app_module_pipeline_stages;
CREATE POLICY "service_all_app_module_pipeline_stages" ON app_module_pipeline_stages FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app_module_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  company_id UUID,
  name TEXT NOT NULL,
  stage_id UUID,
  source_crm_lead_id UUID,
  assignee_id UUID,
  status TEXT NOT NULL DEFAULT 'open',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_module_records_module_stage ON app_module_records(module_id, stage_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_module_records_module_lead ON app_module_records(module_id, source_crm_lead_id) WHERE source_crm_lead_id IS NOT NULL;
ALTER TABLE app_module_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_records" ON app_module_records;
CREATE POLICY "service_all_app_module_records" ON app_module_records FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app_module_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  stage_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_module_task_tpl_module ON app_module_task_templates(module_id, order_index);
ALTER TABLE app_module_task_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_task_templates" ON app_module_task_templates;
CREATE POLICY "service_all_app_module_task_templates" ON app_module_task_templates FOR ALL USING (true) WITH CHECK (true);

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
CREATE INDEX IF NOT EXISTS idx_app_module_task_tpl_items ON app_module_task_template_items(template_id, order_index);
ALTER TABLE app_module_task_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_task_template_items" ON app_module_task_template_items;
CREATE POLICY "service_all_app_module_task_template_items" ON app_module_task_template_items FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app_module_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL REFERENCES app_module_records(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assignee_id UUID,
  deadline TIMESTAMPTZ,
  checklist JSONB DEFAULT '[]'::jsonb,
  order_index INT DEFAULT 0,
  template_item_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_module_tasks_record ON app_module_tasks(record_id, order_index);
ALTER TABLE app_module_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_tasks" ON app_module_tasks;
CREATE POLICY "service_all_app_module_tasks" ON app_module_tasks FOR ALL USING (true) WITH CHECK (true);

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
CREATE INDEX IF NOT EXISTS idx_psml_source ON pipeline_stage_module_links(source_kind, source_stage_id) WHERE enabled = TRUE;
ALTER TABLE pipeline_stage_module_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_pipeline_stage_module_links" ON pipeline_stage_module_links;
CREATE POLICY "service_all_pipeline_stage_module_links" ON pipeline_stage_module_links FOR ALL USING (true) WITH CHECK (true);

COMMIT;
