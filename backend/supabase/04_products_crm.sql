-- TuBep Pro - Migration 04: Products & Customer CRM
-- Quản lý sản phẩm (loại, thành phần, cấu trúc) + nâng cấp CRM khách hàng

-- ═══════════════════════════════════════════
-- CUSTOMER CRM upgrade
-- ═══════════════════════════════════════════

-- Thêm cột CRM cho customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_code VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'new';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_revenue NUMERIC(15,0) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

-- Customer interactions (lịch sử tương tác)
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id),
  type VARCHAR(30) NOT NULL, -- 'call' | 'email' | 'meeting' | 'note' | 'visit' | 'zalo' | 'facebook'
  title VARCHAR(255) NOT NULL,
  content TEXT,
  interaction_date TIMESTAMPTZ DEFAULT now(),
  next_action TEXT,
  next_action_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- PRODUCT MANAGEMENT
-- ═══════════════════════════════════════════

-- Danh mục sản phẩm (loại sản phẩm)
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES product_categories(id),
  image_url VARCHAR(500),
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sản phẩm
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES product_categories(id),
  sku VARCHAR(100),
  unit VARCHAR(30) DEFAULT 'cái',
  base_price NUMERIC(15,0) DEFAULT 0,
  cost_price NUMERIC(15,0) DEFAULT 0,
  image_url VARCHAR(500),
  dimensions JSONB, -- {width, height, depth}
  material VARCHAR(100),
  color VARCHAR(100),
  finish VARCHAR(100), -- phủ bề mặt
  specifications JSONB, -- thông số kỹ thuật tùy ý
  status VARCHAR(20) DEFAULT 'active', -- 'active' | 'inactive' | 'discontinued'
  stock_quantity INT DEFAULT 0,
  min_stock INT DEFAULT 0,
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Thành phần sản phẩm (vật tư / linh kiện)
CREATE TABLE IF NOT EXISTS product_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'panel' | 'hardware' | 'accessory' | 'surface' | 'other'
  unit VARCHAR(30) DEFAULT 'cái',
  unit_price NUMERIC(15,0) DEFAULT 0,
  supplier VARCHAR(255),
  supplier_code VARCHAR(100),
  material VARCHAR(100),
  specifications JSONB,
  stock_quantity INT DEFAULT 0,
  min_stock INT DEFAULT 5,
  image_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cấu trúc sản phẩm (BOM - Bill of Materials)
-- Liên kết sản phẩm ↔ thành phần, với số lượng
CREATE TABLE IF NOT EXISTS product_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  component_id UUID REFERENCES product_components(id) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit VARCHAR(30),
  notes TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, component_id)
);

-- Liên kết sản phẩm ↔ dự án
CREATE TABLE IF NOT EXISTS project_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity INT DEFAULT 1,
  unit_price NUMERIC(15,0),
  discount_percent NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, product_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_product_structures_product ON product_structures(product_id);
CREATE INDEX IF NOT EXISTS idx_product_components_category ON product_components(category);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_assigned ON customers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_products_project ON project_products(project_id);

-- RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON product_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON product_components FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON product_structures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON customer_interactions FOR ALL USING (true) WITH CHECK (true);
