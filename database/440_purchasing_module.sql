-- ════════════════════════════════════════════════════════════
-- 440: Module Mua hàng — thương hiệu, Lệnh đặt hàng (PO), permissions
-- Catalog mở rộng products.brand_id; PO gắn crm_leads (deal).
-- ════════════════════════════════════════════════════════════

-- ── 1. Thương hiệu (product_brands) ──────────────────────────
CREATE TABLE IF NOT EXISTS product_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  logo_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_brands_company
  ON product_brands(company_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_product_brands_code
  ON product_brands(lower(trim(code))) WHERE code IS NOT NULL AND is_active = true;

COMMENT ON TABLE product_brands IS
  'Module Mua hàng: thương hiệu sản phẩm (VD Häfele). company_id NULL = dùng chung hệ thống.';

ALTER TABLE product_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_product_brands" ON product_brands;
CREATE POLICY "service_all_product_brands" ON product_brands FOR ALL USING (true) WITH CHECK (true);

-- Seed Häfele (global, company_id NULL)
INSERT INTO product_brands (name, code, notes, is_active)
SELECT 'Häfele', 'HAFELE',
  'Tham chiếu catalog Häfele FF Storage Solutions 2025–2026',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM product_brands WHERE lower(trim(code)) = 'hafele'
);

-- ── 2. products.brand_id ─────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES product_brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id) WHERE brand_id IS NOT NULL;

-- ── 3. Danh mục phụ kiện Häfele (product_categories) ─────────
-- Parent: Phụ kiện bếp (slug phu-kien-bep) nếu có; không thì tạo root "Phụ kiện Häfele"
DO $$
DECLARE
  parent_id UUID;
BEGIN
  SELECT id INTO parent_id FROM product_categories WHERE slug = 'phu-kien-bep' LIMIT 1;
  IF parent_id IS NULL THEN
    INSERT INTO product_categories (name, slug, description, order_index, is_active)
    VALUES ('Phụ kiện Häfele', 'phu-kien-hafele',
      'Danh mục theo brochure Häfele FF Storage Solutions', 10, true)
    RETURNING id INTO parent_id;
  END IF;

  INSERT INTO product_categories (name, slug, description, parent_id, order_index, is_active)
  SELECT v.name, v.slug, v.description, parent_id, v.ord, true
  FROM (VALUES
    ('Lưu trữ (Storage)', 'hafele-storage', 'Giải pháp lưu trữ bếp', 1),
    ('Sắp xếp (Organisation)', 'hafele-organisation', 'Phụ kiện sắp xếp đồ dùng', 2),
    ('Bồn rửa (Sinks)', 'hafele-sinks', 'Khu vực dọn rửa', 3),
    ('Xử lý rác (Disposal)', 'hafele-disposal', 'Hệ thống xử lý rác', 4)
  ) AS v(name, slug, description, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM product_categories c WHERE c.slug = v.slug
  );
END $$;

-- ── 4. Lệnh đặt hàng (purchase_orders) ───────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,

  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,

  title TEXT,
  notes TEXT,
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,

  subtotal NUMERIC(18, 2) DEFAULT 0,
  tax_rate NUMERIC(8, 2) DEFAULT 10,
  tax_amount NUMERIC(18, 2) DEFAULT 0,
  total NUMERIC(18, 2) DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'confirmed', 'ordered',
      'partial_received', 'received', 'cancelled'
    )),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  ordered_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_code_uq ON purchase_orders(code);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_lead ON purchase_orders(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id) WHERE supplier_id IS NOT NULL;

COMMENT ON TABLE purchase_orders IS
  'Module Mua hàng: Lệnh đặt hàng (PO) gắn deal CRM. Mã LDH-YYYY-NNN. status=submitted → inbox mua hàng.';

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_purchase_orders" ON purchase_orders;
CREATE POLICY "service_all_purchase_orders" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

-- ── 5. Dòng lệnh đặt hàng ────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  item_order INT DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'cái',
  quantity NUMERIC(18, 4) DEFAULT 1,
  unit_price NUMERIC(18, 2) DEFAULT 0,
  amount NUMERIC(18, 2) DEFAULT 0,
  brand_name TEXT,
  sku TEXT,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product ON purchase_order_items(product_id)
  WHERE product_id IS NOT NULL;

COMMENT ON TABLE purchase_order_items IS
  'Dòng hàng Lệnh đặt hàng — snapshot tên/giá/ảnh; product_id tùy chọn.';

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_purchase_order_items" ON purchase_order_items;
CREATE POLICY "service_all_purchase_order_items" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Permissions ───────────────────────────────────────────
DO $$
DECLARE
  has_description boolean;
  has_is_active   boolean;
  rec RECORD;
  cols text;
  vals text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='description')
    INTO has_description;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='is_active')
    INTO has_is_active;

  FOR rec IN
    SELECT * FROM (VALUES
      ('mua_hang_orders',   'view',  'Mua hàng — Lệnh đặt hàng — Xem'),
      ('mua_hang_orders',   'edit',  'Mua hàng — Lệnh đặt hàng — Sửa'),
      ('mua_hang_orders',   'admin', 'Mua hàng — Lệnh đặt hàng — Admin'),
      ('mua_hang_products', 'view',  'Mua hàng — Sản phẩm — Xem'),
      ('mua_hang_products', 'edit',  'Mua hàng — Sản phẩm — Sửa'),
      ('mua_hang_products', 'admin', 'Mua hàng — Sản phẩm — Admin'),
      ('mua_hang_brands',   'view',  'Mua hàng — Thương hiệu — Xem'),
      ('mua_hang_brands',   'edit',  'Mua hàng — Thương hiệu — Sửa'),
      ('mua_hang_brands',   'admin', 'Mua hàng — Thương hiệu — Admin')
    ) AS t(resource, action, p_desc)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM permissions WHERE resource = rec.resource AND action = rec.action
    ) THEN
      cols := 'resource, action';
      vals := quote_literal(rec.resource) || ', ' || quote_literal(rec.action);
      IF has_description THEN
        cols := cols || ', description';
        vals := vals || ', ' || quote_literal(rec.p_desc);
      END IF;
      IF has_is_active THEN
        cols := cols || ', is_active';
        vals := vals || ', true';
      END IF;
      EXECUTE 'INSERT INTO permissions (' || cols || ') VALUES (' || vals || ')';
    ELSE
      IF has_description THEN
        EXECUTE 'UPDATE permissions SET description = $1'
                || CASE WHEN has_is_active THEN ', is_active = true' ELSE '' END
                || ' WHERE resource = $2 AND action = $3'
          USING rec.p_desc, rec.resource, rec.action;
      ELSIF has_is_active THEN
        EXECUTE 'UPDATE permissions SET is_active = true WHERE resource = $1 AND action = $2'
          USING rec.resource, rec.action;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 7. Feature flag purchasing ───────────────────────────────
INSERT INTO tier_features (tier, feature_key, enabled) VALUES
  ('free', 'purchasing', true),
  ('starter', 'purchasing', true),
  ('pro', 'purchasing', true),
  ('enterprise', 'purchasing', true)
ON CONFLICT DO NOTHING;
