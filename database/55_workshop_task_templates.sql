-- Bộ nhiệm vụ mẫu xưởng (sản xuất / vận chuyển–lắp đặt) — tách khỏi crm_task_templates
-- Chạy trên Supabase SQL Editor hoặc pipeline migration.

CREATE TABLE IF NOT EXISTS workshop_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  workshop_area TEXT NOT NULL CHECK (workshop_area IN ('production', 'logistics')),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_task_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workshop_task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  deadline_days INT DEFAULT 0,
  order_index INT DEFAULT 0,
  checklist JSONB DEFAULT '[]'::jsonb,
  default_allowed_companies UUID[] DEFAULT NULL,
  default_allowed_departments UUID[] DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_task_tpl_area ON workshop_task_templates(workshop_area);
CREATE INDEX IF NOT EXISTS idx_workshop_task_tpl_items_tpl ON workshop_task_template_items(template_id);

ALTER TABLE workshop_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_task_template_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workshop_task_templates_all ON workshop_task_templates;
CREATE POLICY workshop_task_templates_all ON workshop_task_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS workshop_task_template_items_all ON workshop_task_template_items;
CREATE POLICY workshop_task_template_items_all ON workshop_task_template_items FOR ALL USING (true) WITH CHECK (true);
