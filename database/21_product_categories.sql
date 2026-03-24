-- ═══════════════════════════════════════════
-- 21. PRODUCT CATEGORIES (Nhóm ngành sản phẩm)
-- ═══════════════════════════════════════════
-- Dùng để phân loại sản phẩm theo nhóm ngành
-- VD: Tủ bếp, Phụ kiện, Bàn đá, Thiết bị, Vật liệu...

CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  image_url TEXT,
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add category_id to products table (if not exists)
DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_product_categories_slug ON product_categories(slug);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- Seed data: nhóm ngành mẫu cho ngành tủ bếp
INSERT INTO product_categories (name, slug, order_index) VALUES
  ('Tủ bếp', 'tu-bep', 1),
  ('Phụ kiện bếp', 'phu-kien-bep', 2),
  ('Bàn đá', 'ban-da', 3),
  ('Thiết bị bếp', 'thiet-bi-bep', 4),
  ('Vật liệu', 'vat-lieu', 5),
  ('Tủ quần áo', 'tu-quan-ao', 6),
  ('Nội thất khác', 'noi-that-khac', 7)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_categories_all" ON product_categories FOR ALL USING (true) WITH CHECK (true);
