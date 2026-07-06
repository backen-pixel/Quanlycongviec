-- ════════════════════════════════════════════════════════════
-- 513: SaaS Store — gói modun bán trên landing, đơn mua, đăng ký thông báo
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saas_modules (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  features JSONB NOT NULL DEFAULT '[]',
  price_monthly BIGINT NOT NULL DEFAULT 0,
  category VARCHAR(64) NOT NULL DEFAULT 'management',
  color VARCHAR(32) DEFAULT '#3b82f6',
  icon_url TEXT,
  icon_key VARCHAR(64),
  badge VARCHAR(32) DEFAULT 'comingSoon',
  featured INT NOT NULL DEFAULT 99,
  feature_key VARCHAR(64),
  tier_on_purchase VARCHAR(50) DEFAULT 'starter',
  trial_days INT DEFAULT 14,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_purchasable BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saas_modules_active ON saas_modules(is_active, sort_order);

CREATE TABLE IF NOT EXISTS saas_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id VARCHAR(64) NOT NULL REFERENCES saas_modules(id),
  buyer_email VARCHAR(255) NOT NULL,
  buyer_name VARCHAR(255),
  company_name VARCHAR(255),
  phone VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount BIGINT,
  notes TEXT,
  provision_meta JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  provisioned_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_saas_purchases_status ON saas_purchases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_purchases_email ON saas_purchases(buyer_email);
CREATE INDEX IF NOT EXISTS idx_saas_purchases_module ON saas_purchases(module_id);

CREATE TABLE IF NOT EXISTS saas_notify_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  module_id VARCHAR(64) REFERENCES saas_modules(id) ON DELETE SET NULL,
  source VARCHAR(64) DEFAULT 'landing',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email, module_id)
);

CREATE INDEX IF NOT EXISTS idx_saas_notify_email ON saas_notify_subscribers(email);

ALTER TABLE saas_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_notify_subscribers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_all_saas_modules" ON saas_modules FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_all_saas_purchases" ON saas_purchases FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "service_all_saas_notify" ON saas_notify_subscribers FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed gói modun (đồng bộ với landing)
INSERT INTO saas_modules (id, title, description, features, price_monthly, category, color, icon_key, badge, featured, feature_key, sort_order, is_purchasable) VALUES
('production', 'Xưởng Sản Xuất', 'Quản lý sản xuất, lệnh sản xuất và tiến độ xưởng trực quan.',
 '["Lệnh sản xuất","Kanban xưởng","Theo dõi tiến độ","Báo cáo năng suất","Phân công nhân sự"]'::jsonb,
 799000, 'production', '#f97316', 'sx', 'bestSeller', 1, 'production', 1, true),
('crm', 'CRM', 'Quản lý khách hàng và quy trình bán hàng chuyên nghiệp.',
 '["Quản lý khách hàng 360°","Quy trình bán hàng","Chăm sóc khách hàng","Báo cáo doanh số"]'::jsonb,
 499000, 'sales', '#3b82f6', 'crm', 'comingSoon', 2, 'crm', 2, true),
('marketing', 'Marketing', 'Quản lý chiến dịch và leads hiệu quả.',
 '["Email / SMS marketing","Tự động hoá chiến dịch","Phân khúc khách hàng","Phân tích hiệu quả"]'::jsonb,
 399000, 'marketing', '#ec4899', 'megaphone', 'comingSoon', 3, NULL, 3, false),
('website', 'Website', 'Xây dựng website chuyên nghiệp cho doanh nghiệp.',
 '["Chuẩn SEO","Giỏ hàng trực tuyến","Quản lý nội dung","Theo dõi lượt truy cập"]'::jsonb,
 699000, 'marketing', '#22c55e', 'globe', 'comingSoon', 4, NULL, 4, false),
('mobile', 'Mobile App', 'Quản lý mọi lúc mọi nơi trên thiết bị di động.',
 '["iOS & Android","Thông báo đẩy","Quản lý đơn hàng","Báo cáo di động"]'::jsonb,
 299000, 'tech', '#6366f1', 'vc', 'comingSoon', 5, NULL, 5, false),
('warehouse', 'Kho nâng cao', 'Quản lý kho hàng đa chi nhánh, đa vị trí.',
 '["Đa kho, đa chi nhánh","Quản lý vị trí kho","Tồn kho thông minh","Cảnh báo tồn kho"]'::jsonb,
 299000, 'management', '#8b5cf6', 'work', 'comingSoon', 6, NULL, 6, false),
('accounting', 'Kế toán', 'Kế toán và báo cáo tài chính tích hợp.',
 '["Thu chi, công nợ","Quản lý công nợ","Báo cáo tài chính","Hoá đơn điện tử"]'::jsonb,
 599000, 'management', '#14b8a6', 'ketoan', 'comingSoon', 7, 'accounting', 7, true),
('reports', 'Báo cáo nâng cao', 'Phân tích dữ liệu và báo cáo tuỳ biến.',
 '["Dashboard tuỳ chỉnh","Báo cáo đa chiều","Phân tích xu hướng","Xuất PDF / Excel"]'::jsonb,
 399000, 'management', '#ef4444', 'calc', 'comingSoon', 8, NULL, 8, false),
('api', 'Tích hợp API', 'Kết nối hệ thống với bên thứ ba.',
 '["RESTful API","Webhook","Tích hợp bên thứ 3","Tài liệu API đầy đủ"]'::jsonb,
 499000, 'tech', '#eab308', 'plug', 'comingSoon', 9, 'api_access', 9, true),
('ai', 'AI Trợ lý', 'Trợ lý thông minh hỗ trợ vận hành và ra quyết định.',
 '["Chat nội bộ AI","Gợi ý tác vụ","Phân tích nhanh","Tóm tắt báo cáo"]'::jsonb,
 899000, 'tech', '#10b981', 'knowledge', 'new', 10, 'ai_assistant', 10, true)
ON CONFLICT (id) DO NOTHING;
