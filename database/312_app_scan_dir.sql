-- ═══════════════════════════════════════════════════════════════
-- 312_app_scan_dir.sql — Thư mục quét APK tùy chỉnh cho từng app
--   Cho phép admin cấu hình đường dẫn thư mục chứa file .apk để quét/import,
--   thay vì chỉ dựa vào quy ước <app>/dist mặc định.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE mobile_apps
  ADD COLUMN IF NOT EXISTS apk_scan_dir TEXT;

COMMENT ON COLUMN mobile_apps.apk_scan_dir
  IS 'Đường dẫn thư mục quét file APK (tùy chỉnh cho từng app). Bỏ trống = dùng thư mục mặc định theo quy ước.';
