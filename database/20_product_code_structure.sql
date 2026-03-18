-- ═══════════════════════════════════════════════════════════════
-- 20_product_code_structure.sql
-- Cấu trúc mã thành phẩm + giá bán VAT
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Bảng danh mục mã thành phần (product_code_parts) ──
-- Mỗi row = 1 giá trị của 1 loại mã (vd: nhóm SP = "TB", quy cách = "L", ...)
CREATE TABLE IF NOT EXISTS product_code_parts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  part_type TEXT NOT NULL,  -- 'group','spec','standard','category','style','glass','type_standard','side','size'
  code TEXT NOT NULL,       -- mã viết tắt (VD: "TB", "L", "AC", ...)
  name TEXT NOT NULL,       -- tên đầy đủ (VD: "Tủ bếp", "Chữ L", "Acrylic", ...)
  description TEXT,
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(part_type, code)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_product_code_parts_type ON product_code_parts(part_type, is_active);

-- ── 2. Thêm cột vào products ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS selling_price NUMERIC DEFAULT 0;  -- Giá bán gồm VAT
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 10;       -- % VAT (default 10%)

-- Code part references
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_group TEXT;      -- Mã nhóm SP
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_spec TEXT;       -- Mã quy cách
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_standard TEXT;   -- Mã tiêu chuẩn
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_category TEXT;   -- Mã loại/phân loại
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_style TEXT;      -- Mã hình thức
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_glass TEXT;      -- Mã kính
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_type_std TEXT;   -- Mã chuẩn loại
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_side TEXT;       -- Mã hông
ALTER TABLE products ADD COLUMN IF NOT EXISTS code_size TEXT;       -- Mã kích thước quy ước

-- ── 3. Seed data mẫu cho các part_type ──
-- Nhóm sản phẩm
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('group', 'TB', 'Tủ bếp', 1),
  ('group', 'TQ', 'Tủ quần áo', 2),
  ('group', 'TG', 'Tủ giày', 3),
  ('group', 'KE', 'Kệ tivi', 4),
  ('group', 'BL', 'Bàn làm việc', 5)
ON CONFLICT (part_type, code) DO NOTHING;

-- Quy cách
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('spec', 'L', 'Chữ L', 1),
  ('spec', 'U', 'Chữ U', 2),
  ('spec', 'I', 'Chữ I (thẳng)', 3),
  ('spec', 'T', 'Chữ T', 4),
  ('spec', 'DP', 'Đảo + Peninsula', 5)
ON CONFLICT (part_type, code) DO NOTHING;

-- Tiêu chuẩn
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('standard', 'TC', 'Tiêu chuẩn', 1),
  ('standard', 'CC', 'Cao cấp', 2),
  ('standard', 'VIP', 'VIP', 3)
ON CONFLICT (part_type, code) DO NOTHING;

-- Loại / Phân loại
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('category', 'GO', 'Gỗ tự nhiên', 1),
  ('category', 'CN', 'Gỗ công nghiệp', 2),
  ('category', 'AC', 'Acrylic', 3),
  ('category', 'LM', 'Laminate', 4),
  ('category', 'ML', 'Melamine', 5)
ON CONFLICT (part_type, code) DO NOTHING;

-- Hình thức
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('style', 'HĐ', 'Hiện đại', 1),
  ('style', 'CĐ', 'Cổ điển', 2),
  ('style', 'TG', 'Tối giản', 3),
  ('style', 'BC', 'Bán cổ điển', 4)
ON CONFLICT (part_type, code) DO NOTHING;

-- Kính
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('glass', 'KK', 'Không kính', 1),
  ('glass', 'KT', 'Kính trong', 2),
  ('glass', 'KM', 'Kính mờ', 3),
  ('glass', 'KS', 'Kính sơn', 4)
ON CONFLICT (part_type, code) DO NOTHING;

-- Chuẩn loại
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('type_standard', 'A', 'Loại A', 1),
  ('type_standard', 'B', 'Loại B', 2),
  ('type_standard', 'C', 'Loại C', 3)
ON CONFLICT (part_type, code) DO NOTHING;

-- Hông
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('side', 'HT', 'Hông trái', 1),
  ('side', 'HP', 'Hông phải', 2),
  ('side', 'H2', 'Hai hông', 3),
  ('side', 'KH', 'Không hông', 4)
ON CONFLICT (part_type, code) DO NOTHING;

-- Kích thước quy ước
INSERT INTO product_code_parts (part_type, code, name, order_index) VALUES
  ('size', 'S', 'Nhỏ (< 2m)', 1),
  ('size', 'M', 'Trung bình (2-3m)', 2),
  ('size', 'L', 'Lớn (3-4m)', 3),
  ('size', 'XL', 'Rất lớn (> 4m)', 4)
ON CONFLICT (part_type, code) DO NOTHING;

-- ── 4. RLS ──
ALTER TABLE product_code_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_code_parts_read" ON product_code_parts FOR SELECT USING (true);
CREATE POLICY "product_code_parts_write" ON product_code_parts FOR ALL USING (true) WITH CHECK (true);
