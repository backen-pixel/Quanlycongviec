-- ═══════════════════════════════════════════════════════════════════════════════
-- 728 — web_sites: module Marketing quản lý nhiều website
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- BỐI CẢNH
-- --------
-- Migration 727 gắn sản phẩm web theo company_id — mỗi công ty một website.
-- Thực tế một công ty có thể chạy nhiều website (bepviet, site landing chiến dịch,
-- site cho dòng sản phẩm khác…). Bảng này tách "website" thành thực thể riêng để
-- module Marketing quản lý được nhiều site, mỗi site một bộ sản phẩm.
--
-- SITE_KEY
-- --------
-- Định danh ngắn, duy nhất toàn hệ thống (VD "bepviet"). Website tĩnh gọi
-- GET /api/public/web/products?site=bepviet — dễ đọc và dễ cấu hình hơn truyền UUID.
--
-- AN TOÀN
-- -------
--   • Chạy lại nhiều lần được (idempotent).
--   • web_products.site_id cho phép NULL: dòng cũ (nếu có) vẫn chạy theo company_id.
--   • Backend tự dò bảng: chưa chạy migration thì phần quản lý site báo rõ, phần
--     sản phẩm theo công ty vẫn hoạt động như trước.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS web_sites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  site_key     VARCHAR(64) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  domain       VARCHAR(255),
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- site_key duy nhất toàn hệ thống vì API công khai tra cứu site chỉ bằng key này.
CREATE UNIQUE INDEX IF NOT EXISTS uq_web_sites_key ON web_sites(site_key);
CREATE INDEX IF NOT EXISTS idx_web_sites_company ON web_sites(company_id, is_active);

COMMENT ON TABLE web_sites IS
  'Mỗi dòng là một website do module Marketing quản lý (VD bepviet). Sản phẩm web '
  'trỏ về đây qua web_products.site_id.';
COMMENT ON COLUMN web_sites.site_key IS
  'Định danh ngắn duy nhất toàn hệ thống, dùng trong API công khai: '
  'GET /api/public/web/products?site=<site_key>. Đặt biến VITE_SITE_KEY của site tĩnh bằng giá trị này.';
COMMENT ON COLUMN web_sites.domain IS 'Tên miền thật, chỉ để hiển thị và đối chiếu — không dùng để xác thực.';
COMMENT ON COLUMN web_sites.is_active IS
  'Tắt = API công khai của site trả rỗng, website tự rơi về dữ liệu tĩnh của nó.';

ALTER TABLE web_products
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES web_sites(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_web_products_site
  ON web_products(site_id, is_published, order_index);

COMMENT ON COLUMN web_products.site_id IS
  'Website chứa sản phẩm này. NULL = dòng tạo trước migration 728, chỉ lọc theo company_id.';

-- Backend dùng service role; RLS bật kèm policy service như các bảng khác.
ALTER TABLE web_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_web_sites" ON web_sites;
CREATE POLICY "service_all_web_sites" ON web_sites FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION set_web_sites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_web_sites_updated_at ON web_sites;
CREATE TRIGGER trg_web_sites_updated_at
  BEFORE UPDATE ON web_sites
  FOR EACH ROW EXECUTE FUNCTION set_web_sites_updated_at();
