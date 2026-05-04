-- 120: Nhóm ngành & sản phẩm theo công ty

ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_categories_company_id ON product_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);

COMMENT ON COLUMN product_categories.company_id IS 'Nhóm ngành thuộc công ty; NULL = dữ liệu cũ / fallback';
COMMENT ON COLUMN products.company_id IS 'Sản phẩm thuộc công ty; đồng bộ với nhóm ngành khi có category_id';

DO $$
DECLARE
  phuc_id UUID;
BEGIN
  SELECT id INTO phuc_id FROM companies
  WHERE name ILIKE '%Phúc Đạt%' OR short_name ILIKE '%Phúc Đạt%'
     OR name ILIKE '%Phuc Dat%' OR short_name ILIKE '%Phuc Dat%'
     OR (name ILIKE '%Phúc%' AND name ILIKE '%Đạt%')
  LIMIT 1;

  IF phuc_id IS NULL THEN
    RAISE NOTICE '120: Không tìm thấy Phúc Đạt — chỉ thêm cột, không backfill';
    RETURN;
  END IF;

  UPDATE product_categories SET company_id = phuc_id WHERE company_id IS NULL;
  UPDATE products SET company_id = phuc_id WHERE company_id IS NULL;

  UPDATE products p
  SET company_id = c.company_id
  FROM product_categories c
  WHERE p.category_id = c.id AND c.company_id IS NOT NULL
    AND (p.company_id IS DISTINCT FROM c.company_id);

  RAISE NOTICE '120: Backfill company_id hoàn tất';
END $$;
