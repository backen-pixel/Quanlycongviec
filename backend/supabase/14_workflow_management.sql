-- Migration 14: Workflow management + Customer status mapping
-- Adds: customer_statuses table, customer_status_mapping, customers.status_id

-- ═══ Customer Statuses ═══
CREATE TABLE IF NOT EXISTS customer_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(7) DEFAULT '#6B7280',
  icon VARCHAR(50),
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ Mapping: workflow stage → customer status ═══
CREATE TABLE IF NOT EXISTS stage_customer_status_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID REFERENCES workflow_stages(id) ON DELETE CASCADE NOT NULL,
  customer_status_id UUID REFERENCES customer_statuses(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(stage_id)
);

-- ═══ Add status_id to customers ═══
DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES customer_statuses(id);
EXCEPTION WHEN others THEN NULL;
END $$;

-- ═══ Add icon to workflow_stages if missing ═══
DO $$ BEGIN
  ALTER TABLE workflow_stages ADD COLUMN IF NOT EXISTS description TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ═══ Seed default customer statuses ═══
INSERT INTO customer_statuses (name, slug, color, icon, description, order_index) VALUES
  ('Tiềm năng', 'potential', '#8B5CF6', '🔍', 'Khách hàng mới, đang tìm hiểu', 1),
  ('Đang tư vấn', 'consulting', '#3B82F6', '💬', 'Đang được tư vấn, khảo sát', 2),
  ('Chờ báo giá', 'waiting-quote', '#F59E0B', '📋', 'Đã thiết kế, chờ báo giá', 3),
  ('Đã ký HĐ', 'contracted', '#10B981', '📝', 'Đã ký hợp đồng, đang triển khai', 4),
  ('Đang thi công', 'in-progress', '#F97316', '🏗️', 'Dự án đang sản xuất/lắp đặt', 5),
  ('Hoàn thành', 'completed', '#22C55E', '✅', 'Đã hoàn thành, nghiệm thu', 6),
  ('Bảo hành', 'warranty', '#EF4444', '🛡️', 'Đang trong thời gian bảo hành', 7),
  ('Không thành', 'lost', '#6B7280', '❌', 'Khách hàng không tiếp tục', 8)
ON CONFLICT (slug) DO NOTHING;

-- ═══ Seed default stage → customer status mapping ═══
-- This maps each workflow stage to a customer status
INSERT INTO stage_customer_status_map (stage_id, customer_status_id)
SELECT ws.id, cs.id FROM workflow_stages ws
JOIN customer_statuses cs ON (
  (ws.slug = 'consulting' AND cs.slug = 'consulting') OR
  (ws.slug = 'design' AND cs.slug = 'waiting-quote') OR
  (ws.slug = 'quotation' AND cs.slug = 'waiting-quote') OR
  (ws.slug = 'contract' AND cs.slug = 'contracted') OR
  (ws.slug = 'production' AND cs.slug = 'in-progress') OR
  (ws.slug = 'shipping' AND cs.slug = 'in-progress') OR
  (ws.slug = 'installation' AND cs.slug = 'in-progress') OR
  (ws.slug = 'customer-care' AND cs.slug = 'warranty')
)
ON CONFLICT (stage_id) DO NOTHING;
