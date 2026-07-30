-- 477: Module tùy chỉnh — nhiều tab (Lead / Deal / …)

BEGIN;

CREATE TABLE IF NOT EXISTS app_module_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES app_modules(id) ON DELETE CASCADE,
  tab_key VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  icon VARCHAR(40),
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_module_tabs_key_format CHECK (tab_key ~ '^[a-z][a-z0-9_]{0,62}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_module_tabs_module_key
  ON app_module_tabs(module_id, LOWER(tab_key));

CREATE INDEX IF NOT EXISTS idx_app_module_tabs_module_order
  ON app_module_tabs(module_id, order_index);

ALTER TABLE app_module_tabs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_app_module_tabs" ON app_module_tabs;
CREATE POLICY "service_all_app_module_tabs" ON app_module_tabs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE app_module_tabs IS 'Tab Kanban của module tùy chỉnh (vd: lead, deal, cskh).';

ALTER TABLE app_module_pipeline_stages
  ADD COLUMN IF NOT EXISTS tab_id UUID REFERENCES app_module_tabs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_module_stages_tab
  ON app_module_pipeline_stages(tab_id);

ALTER TABLE app_module_records
  ADD COLUMN IF NOT EXISTS tab_id UUID REFERENCES app_module_tabs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_module_records_tab
  ON app_module_records(module_id, tab_id);

-- Seed tab mặc định «Chính» cho mọi module chưa có tab
INSERT INTO app_module_tabs (module_id, tab_key, name, icon, order_index)
SELECT m.id, 'main', 'Chính', '📋', 0
FROM app_modules m
WHERE NOT EXISTS (
  SELECT 1 FROM app_module_tabs t WHERE t.module_id = m.id
);

-- Gắn stage/record cũ vào tab main của module
UPDATE app_module_pipeline_stages s
SET tab_id = t.id
FROM app_module_tabs t
WHERE t.module_id = s.module_id
  AND t.tab_key = 'main'
  AND s.tab_id IS NULL;

UPDATE app_module_records r
SET tab_id = t.id
FROM app_module_tabs t
WHERE t.module_id = r.module_id
  AND t.tab_key = 'main'
  AND r.tab_id IS NULL;

COMMIT;
