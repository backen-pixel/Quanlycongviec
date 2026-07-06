-- ════════════════════════════════════════════════════════════
-- 514: SaaS Plans — 4 gói chính + module mua thêm
-- Chạy sau 513_saas_store.sql
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saas_plans (
  id VARCHAR(32) PRIMARY KEY,
  tenant_tier VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle TEXT,
  description TEXT,
  price_monthly BIGINT NOT NULL DEFAULT 0,
  max_users INT NOT NULL DEFAULT 5,
  max_companies INT NOT NULL DEFAULT 1,
  highlights JSONB NOT NULL DEFAULT '[]',
  badge VARCHAR(32),
  color VARCHAR(32) DEFAULT '#3b82f6',
  trial_days INT DEFAULT 14,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_purchasable BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_plans_active ON saas_plans(is_active, sort_order);

ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(16) NOT NULL DEFAULT 'module';
ALTER TABLE saas_purchases ADD COLUMN IF NOT EXISTS plan_id VARCHAR(32) REFERENCES saas_plans(id);
ALTER TABLE saas_purchases ALTER COLUMN module_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saas_purchases_plan ON saas_purchases(plan_id);
CREATE INDEX IF NOT EXISTS idx_saas_purchases_type ON saas_purchases(purchase_type);

ALTER TABLE saas_modules ADD COLUMN IF NOT EXISTS is_addon BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE saas_modules ADD COLUMN IF NOT EXISTS min_plan_id VARCHAR(32) REFERENCES saas_plans(id);

ALTER TABLE saas_plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_all_saas_plans" ON saas_plans FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4 gói chính (map tenant_tier → tier_features hiện có)
INSERT INTO saas_plans (id, tenant_tier, title, subtitle, description, price_monthly, max_users, max_companies, highlights, badge, color, trial_days, sort_order, is_purchasable) VALUES
('free', 'free', 'Free', 'Dùng thử & xưởng nhỏ', 'Bắt đầu miễn phí với CRM, công việc và dự án cơ bản.',
 0, 5, 1,
 '["CRM cơ bản","Quản lý công việc","Dự án","5 người dùng","1 công ty"]'::jsonb,
 NULL, '#64748b', 14, 1, true),
('standard', 'starter', 'Standard', 'Xưởng vừa & đội sales', 'Thêm sản xuất và quản lý khách hàng cho xưởng đang tăng trưởng.',
 990000, 20, 3,
 '["Mọi tính năng Free","Sản xuất (SX)","Khách hàng 360°","20 người dùng","3 công ty"]'::jsonb,
 'popular', '#3b82f6', 14, 2, true),
('pro', 'pro', 'Pro', 'Doanh nghiệp đa bộ phận', 'Vận chuyển, AI trợ lý và Drive — vận hành trọn gói.',
 2490000, 50, 5,
 '["Mọi tính năng Standard","Vận chuyển (VC)","AI Trợ lý","Drive lưu trữ","50 người dùng","5 công ty"]'::jsonb,
 NULL, '#8b5cf6', 14, 3, true),
('ultra', 'enterprise', 'Ultra', 'Tập đoàn & tích hợp', 'Kế toán, API và giới hạn mở rộng — không giới hạn quy mô.',
 4990000, 200, 20,
 '["Mọi tính năng Pro","Kế toán","Tích hợp API","200 người dùng","20 công ty","Hỗ trợ ưu tiên"]'::jsonb,
 'best', '#f59e0b', 14, 4, true)
ON CONFLICT (id) DO NOTHING;

-- Module = mua THÊM sau khi đã có gói chính
UPDATE saas_modules SET is_addon = true;

UPDATE saas_modules SET min_plan_id = 'free' WHERE min_plan_id IS NULL;

-- Modun marketing/website/mobile... luôn là add-on (không có trong tier_features)
UPDATE saas_modules SET min_plan_id = 'standard' WHERE id IN ('marketing', 'website', 'mobile', 'warehouse', 'reports') AND feature_key IS NULL;
