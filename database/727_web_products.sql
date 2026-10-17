-- ═══════════════════════════════════════════════════════════════════════════════
-- 727 — web_products: danh mục mẫu tủ bếp hiển thị trên website bán hàng
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- BỐI CẢNH
-- --------
-- Website bán hàng (nhánh feat/web-ban-hang-tu-bep, thư mục bepviet/) là static site
-- riêng, trước nay dùng dữ liệu tĩnh trong file. Bảng này cho phép quản lý mẫu tủ bếp
-- từ ERP (module marketing → tab "Sản phẩm website") và website đọc qua API công khai
-- GET /api/public/web/products.
--
-- VÌ SAO KHÔNG DÙNG BẢNG products SẴN CÓ
-- --------------------------------------
-- `products` là danh mục thành phẩm nội bộ ở mức linh kiện (mã quy cách, cánh, thùng),
-- dùng cho báo giá và sản xuất, và chứa `cost_price` — giá vốn, không được lộ ra web.
-- Bảng này là lớp marketing riêng: mỗi dòng là MỘT MẪU BẾP để trưng bày, có slug, ảnh,
-- tiện ích, thứ tự hiển thị và cờ bật/tắt. Hai bảng phục vụ hai mục đích khác nhau,
-- không ràng buộc lẫn nhau.
--
-- AN TOÀN
-- -------
--   • Chạy lại nhiều lần được (idempotent).
--   • Bảng mới hoàn toàn, không đụng bảng nào đang có, không backfill.
--   • Backend tự dò bảng: chưa chạy migration thì API trả mảng rỗng kèm cảnh báo,
--     website tự rơi về dữ liệu tĩnh — không trang nào trắng.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS web_products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID REFERENCES companies(id) ON DELETE CASCADE,
  slug           VARCHAR(160) NOT NULL,
  name           VARCHAR(200) NOT NULL,
  category       VARCHAR(120),
  category_key   VARCHAR(64),
  material       VARCHAR(120),
  material_key   VARCHAR(64),
  price_from     NUMERIC DEFAULT 0,
  price_unit     VARCHAR(32) DEFAULT 'm dài',
  size_text      VARCHAR(200),
  description    TEXT,
  features       JSONB DEFAULT '[]'::jsonb,
  images         JSONB DEFAULT '[]'::jsonb,
  color_from     VARCHAR(16),
  color_to       VARCHAR(16),
  is_featured    BOOLEAN NOT NULL DEFAULT false,
  is_published   BOOLEAN NOT NULL DEFAULT true,
  order_index    INTEGER NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Một công ty không có hai mẫu trùng slug (slug nằm trên URL sản phẩm của website).
CREATE UNIQUE INDEX IF NOT EXISTS uq_web_products_company_slug
  ON web_products(company_id, slug);

-- Truy vấn chính của website: lấy mẫu đã bật của một công ty, theo thứ tự hiển thị.
CREATE INDEX IF NOT EXISTS idx_web_products_public
  ON web_products(company_id, is_published, order_index);

CREATE INDEX IF NOT EXISTS idx_web_products_category
  ON web_products(company_id, category_key);

COMMENT ON TABLE web_products IS
  'Mẫu tủ bếp trưng bày trên website bán hàng. Quản lý tại ERP (module marketing → '
  'tab Sản phẩm website), website đọc qua GET /api/public/web/products. Khác bảng '
  'products (danh mục thành phẩm nội bộ cho báo giá/sản xuất, có giá vốn).';

COMMENT ON COLUMN web_products.company_id IS
  'Công ty sở hữu website. Mỗi công ty một bộ sản phẩm web riêng; API công khai bắt '
  'buộc truyền company_id nên không có chuyện lộ chéo dữ liệu giữa các công ty.';
COMMENT ON COLUMN web_products.slug IS
  'Định danh trên URL, VD "tu-bep-chu-l-modena". Backend tự sinh từ name nếu bỏ trống.';
COMMENT ON COLUMN web_products.category IS 'Tên kiểu bếp hiển thị, VD "Tủ bếp chữ L".';
COMMENT ON COLUMN web_products.category_key IS
  'Slug của category, dùng làm giá trị bộ lọc trên web. Backend tự sinh từ category.';
COMMENT ON COLUMN web_products.material IS 'Tên vật liệu hiển thị, VD "Acrylic bóng gương".';
COMMENT ON COLUMN web_products.material_key IS 'Slug của material, dùng làm giá trị bộ lọc.';
COMMENT ON COLUMN web_products.price_from IS
  'Giá tham khảo "từ", VNĐ. Là giá bán công khai — KHÔNG lấy từ products.cost_price.';
COMMENT ON COLUMN web_products.price_unit IS 'Đơn vị giá hiển thị: "m dài", "bộ", "m²"…';
COMMENT ON COLUMN web_products.features IS
  'Mảng chuỗi tiện ích hiển thị dạng chip, VD ["Ray giảm chấn Blum","Bảo hành 5 năm"].';
COMMENT ON COLUMN web_products.images IS
  'Mảng URL ảnh. Rỗng thì website tự vẽ ảnh SVG từ color_from/color_to.';
COMMENT ON COLUMN web_products.color_from IS 'Mã màu gradient đầu cho ảnh SVG thay thế, VD "#d6c3a5".';
COMMENT ON COLUMN web_products.color_to IS 'Mã màu gradient cuối cho ảnh SVG thay thế, VD "#3f3a35".';
COMMENT ON COLUMN web_products.is_featured IS 'Bật = hiện ở khối "Bán chạy" trang chủ.';
COMMENT ON COLUMN web_products.is_published IS
  'Tắt = ẩn khỏi website nhưng vẫn giữ trong ERP. API công khai chỉ trả dòng is_published=true.';
COMMENT ON COLUMN web_products.order_index IS 'Thứ tự hiển thị, nhỏ đứng trước.';

-- Backend dùng service role; RLS bật kèm policy service như các bảng khác trong hệ thống.
ALTER TABLE web_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_web_products" ON web_products;
CREATE POLICY "service_all_web_products" ON web_products FOR ALL USING (true) WITH CHECK (true);

-- updated_at tự cập nhật khi sửa.
CREATE OR REPLACE FUNCTION set_web_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_web_products_updated_at ON web_products;
CREATE TRIGGER trg_web_products_updated_at
  BEFORE UPDATE ON web_products
  FOR EACH ROW EXECUTE FUNCTION set_web_products_updated_at();
