-- Phân loại nguồn lead + FK trên crm_sources

CREATE TABLE IF NOT EXISTS crm_source_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  order_index INT NOT NULL DEFAULT 0,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_source_categories_company_id ON crm_source_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_source_categories_order ON crm_source_categories(order_index);

COMMENT ON TABLE crm_source_categories IS 'Phân loại nguồn CRM (theo công ty hoặc chung hệ thống)';
COMMENT ON COLUMN crm_source_categories.company_id IS 'NULL = phân loại dùng chung toàn hệ thống';

ALTER TABLE crm_sources ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES crm_source_categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_sources_category_id ON crm_sources(category_id);

ALTER TABLE crm_source_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON crm_source_categories;
CREATE POLICY "service_all" ON crm_source_categories FOR ALL USING (true) WITH CHECK (true);

-- Gợi ý ban đầu (chung — không gán company_id)
INSERT INTO crm_source_categories (name, icon, color, order_index, company_id)
SELECT v.n, v.i, v.c, v.o, NULL::uuid
FROM (VALUES
  ('Online', '🌐', '#3b82f6', 1),
  ('Offline', '🏪', '#64748b', 2),
  ('Đối tác / Giới thiệu', '🤝', '#10b981', 3)
) AS v(n, i, c, o)
WHERE NOT EXISTS (SELECT 1 FROM crm_source_categories c2 WHERE c2.company_id IS NULL AND c2.name = v.n);
