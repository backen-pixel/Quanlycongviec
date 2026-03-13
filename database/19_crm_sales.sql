-- =====================================================
-- 19_crm_sales.sql
-- CRM: Leads, Pipeline, Activities
-- Sales: Quotations, Orders, Invoices (MISA-style)
-- =====================================================

-- ─────────────────────────────────────────────────────
-- 1. CRM PIPELINE & LEADS
-- ─────────────────────────────────────────────────────

-- Nguồn lead
CREATE TABLE IF NOT EXISTS crm_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,           -- Facebook, Zalo, Giới thiệu, Website...
  icon TEXT,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pipeline stages (Kanban columns)
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,            -- Mới, Đã liên hệ, Quan tâm, Báo giá, Đàm phán, Chốt, Thua
  color TEXT DEFAULT '#3b82f6',
  icon TEXT,
  order_index INT NOT NULL DEFAULT 0,
  is_won BOOLEAN DEFAULT false,  -- Giai đoạn "Chốt"
  is_lost BOOLEAN DEFAULT false, -- Giai đoạn "Thua"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Leads / Cơ hội bán hàng
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT,                      -- LEAD-2026-001
  title TEXT NOT NULL,            -- Tên cơ hội: "Tủ bếp căn hộ A.Minh"
  customer_id UUID REFERENCES customers(id),
  stage_id UUID REFERENCES crm_pipeline_stages(id),
  source_id UUID REFERENCES crm_sources(id),
  assigned_to UUID REFERENCES users(id),  -- Sales phụ trách
  
  -- Giá trị & xác suất
  estimated_value NUMERIC DEFAULT 0,     -- Giá trị ước tính
  probability INT DEFAULT 50,            -- % xác suất chốt
  weighted_value NUMERIC GENERATED ALWAYS AS (estimated_value * probability / 100) STORED,
  
  -- Thông tin
  description TEXT,
  expected_close_date DATE,
  actual_close_date DATE,
  lost_reason TEXT,
  
  -- Tracking
  last_activity_at TIMESTAMPTZ,
  next_follow_up DATE,
  
  -- Link to project (khi chốt → tạo dự án)
  project_id UUID REFERENCES projects(id),
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lịch sử tương tác
CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  type TEXT NOT NULL,              -- call, meeting, email, zalo, note, quote_sent
  title TEXT NOT NULL,             -- "Gọi điện tư vấn", "Gửi báo giá lần 1"
  description TEXT,
  outcome TEXT,                    -- Kết quả: "KH quan tâm", "Hẹn gặp thứ 5"
  activity_date TIMESTAMPTZ DEFAULT now(),
  duration_minutes INT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- 2. BÁO GIÁ (Quotations) - Giống MISA
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,               -- BG-2026-001
  
  -- Khách hàng
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,               -- Snapshot tên KH
  customer_phone TEXT,
  customer_address TEXT,
  
  -- Link
  lead_id UUID REFERENCES crm_leads(id),
  project_id UUID REFERENCES projects(id),
  
  -- Thông tin
  title TEXT,                       -- "Báo giá tủ bếp chữ L"
  description TEXT,
  valid_until DATE,                 -- Hiệu lực báo giá
  payment_terms TEXT,               -- Điều khoản thanh toán
  delivery_terms TEXT,              -- Điều khoản giao hàng
  notes TEXT,                       -- Ghi chú
  
  -- Tổng tiền (computed from items)
  subtotal NUMERIC DEFAULT 0,       -- Tổng trước thuế
  discount_type TEXT DEFAULT 'percent', -- percent | amount
  discount_value NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0, -- Số tiền giảm
  tax_rate NUMERIC DEFAULT 10,       -- % VAT
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,           -- Tổng sau thuế
  
  -- Trạng thái
  status TEXT DEFAULT 'draft',       -- draft, sent, accepted, rejected, expired, converted
  
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  
  item_order INT DEFAULT 0,
  name TEXT NOT NULL,               -- Tên hàng/dịch vụ
  description TEXT,                 -- Mô tả chi tiết
  unit TEXT DEFAULT 'bộ',           -- Đơn vị: bộ, cái, m², m dài
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,    -- Đơn giá
  discount_percent NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,        -- Thành tiền = qty * price * (1 - discount%)
  
  -- Specs tủ bếp
  dimensions TEXT,                  -- "3200 x 600 x 820mm"
  material TEXT,                    -- "MDF phủ Melamine"
  color TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- 3. ĐƠN HÀNG (Orders) - Giống MISA
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,               -- DH-2026-001
  
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  
  -- Link
  quotation_id UUID REFERENCES quotations(id),
  lead_id UUID REFERENCES crm_leads(id),
  project_id UUID REFERENCES projects(id),
  
  title TEXT,
  description TEXT,
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,               -- Ngày giao hàng dự kiến
  payment_terms TEXT,
  delivery_address TEXT,
  notes TEXT,
  
  -- Tổng tiền
  subtotal NUMERIC DEFAULT 0,
  discount_type TEXT DEFAULT 'percent',
  discount_value NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 10,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  
  -- Thanh toán
  paid_amount NUMERIC DEFAULT 0,     -- Đã thanh toán
  payment_status TEXT DEFAULT 'unpaid', -- unpaid, partial, paid
  
  -- Trạng thái
  status TEXT DEFAULT 'draft',       -- draft, confirmed, processing, shipped, delivered, cancelled
  
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quotation_item_id UUID REFERENCES quotation_items(id),
  
  item_order INT DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'bộ',
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  
  dimensions TEXT,
  material TEXT,
  color TEXT,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- 4. HÓA ĐƠN (Invoices) - Giống MISA
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,               -- HD-2026-001
  invoice_number TEXT,              -- Số hóa đơn (sổ sách)
  
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_tax_code TEXT,           -- MST khách hàng
  
  -- Link
  order_id UUID REFERENCES orders(id),
  quotation_id UUID REFERENCES quotations(id),
  project_id UUID REFERENCES projects(id),
  
  title TEXT,
  description TEXT,
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,                    -- Hạn thanh toán
  payment_method TEXT,              -- cash, transfer, both
  bank_account TEXT,                -- TK ngân hàng
  notes TEXT,
  
  -- Tổng tiền
  subtotal NUMERIC DEFAULT 0,
  discount_type TEXT DEFAULT 'percent',
  discount_value NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 10,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  
  -- Thanh toán
  paid_amount NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid', -- unpaid, partial, paid
  
  -- Trạng thái
  status TEXT DEFAULT 'draft',       -- draft, issued, sent, paid, overdue, cancelled, void
  
  issued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  order_item_id UUID REFERENCES order_items(id),
  
  item_order INT DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'bộ',
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lịch sử thanh toán
CREATE TABLE IF NOT EXISTS payment_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  
  amount NUMERIC NOT NULL,
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT,              -- cash, transfer
  reference_number TEXT,            -- Số GD ngân hàng
  notes TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────────────
-- 5. AUTO-INCREMENT CODES
-- ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS code_sequences (
  prefix TEXT PRIMARY KEY,          -- LEAD, BG, DH, HD
  current_number INT DEFAULT 0,
  year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
);

INSERT INTO code_sequences (prefix, current_number) VALUES
  ('LEAD', 0), ('BG', 0), ('DH', 0), ('HD', 0)
ON CONFLICT (prefix) DO NOTHING;

-- ─────────────────────────────────────────────────────
-- 6. SEED DATA
-- ─────────────────────────────────────────────────────

-- Nguồn lead
INSERT INTO crm_sources (name, icon, color) VALUES
  ('Facebook', '📘', '#1877F2'),
  ('Zalo', '💬', '#0068FF'),
  ('Website', '🌐', '#10B981'),
  ('Giới thiệu', '🤝', '#8B5CF6'),
  ('Showroom', '🏪', '#F59E0B'),
  ('Gọi điện', '📞', '#EF4444'),
  ('Khác', '📋', '#6B7280')
ON CONFLICT DO NOTHING;

-- Pipeline stages
INSERT INTO crm_pipeline_stages (name, color, icon, order_index, is_won, is_lost) VALUES
  ('Mới', '#94A3B8', '🆕', 1, false, false),
  ('Đã liên hệ', '#3B82F6', '📞', 2, false, false),
  ('Quan tâm', '#8B5CF6', '💜', 3, false, false),
  ('Đã báo giá', '#F59E0B', '💰', 4, false, false),
  ('Đàm phán', '#F97316', '🤝', 5, false, false),
  ('Chốt thành công', '#10B981', '🎉', 6, true, false),
  ('Thua / Hủy', '#EF4444', '❌', 7, false, true)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE crm_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- Allow service role
CREATE POLICY "service_all" ON crm_sources FOR ALL USING (true);
CREATE POLICY "service_all" ON crm_pipeline_stages FOR ALL USING (true);
CREATE POLICY "service_all" ON crm_leads FOR ALL USING (true);
CREATE POLICY "service_all" ON crm_activities FOR ALL USING (true);
CREATE POLICY "service_all" ON quotations FOR ALL USING (true);
CREATE POLICY "service_all" ON quotation_items FOR ALL USING (true);
CREATE POLICY "service_all" ON orders FOR ALL USING (true);
CREATE POLICY "service_all" ON order_items FOR ALL USING (true);
CREATE POLICY "service_all" ON invoices FOR ALL USING (true);
CREATE POLICY "service_all" ON invoice_items FOR ALL USING (true);
CREATE POLICY "service_all" ON payment_records FOR ALL USING (true);
