-- 476: app_modules — category + icon_image cho App Switcher

BEGIN;

ALTER TABLE app_modules
  ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'Tùy chỉnh';

ALTER TABLE app_modules
  ADD COLUMN IF NOT EXISTS icon_image TEXT;

COMMENT ON COLUMN app_modules.category IS 'Nhãn phân loại trên App Switcher (Kinh doanh, Sản xuất, …).';
COMMENT ON COLUMN app_modules.icon_image IS 'URL ảnh icon (vd /icons/calc-module.png). Ưu tiên hơn emoji icon.';
COMMENT ON COLUMN app_modules.icon IS 'Emoji / ký tự icon fallback khi không có icon_image.';

UPDATE app_modules SET category = 'Tùy chỉnh' WHERE category IS NULL OR btrim(category) = '';

COMMIT;
