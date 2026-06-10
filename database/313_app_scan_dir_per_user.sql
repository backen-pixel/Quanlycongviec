-- ═══════════════════════════════════════════════════════════════
-- 313_app_scan_dir_per_user.sql — Thư mục quét APK riêng theo từng nhân viên
--   Mỗi user có thể cấu hình thư mục quét APK riêng cho từng app
--   (vì đường dẫn build nằm trên máy của từng nhân viên chạy backend local).
--   Thứ tự ưu tiên khi quét: scan dir của user → apk_scan_dir của app → mặc định.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_scan_dirs (
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id    UUID NOT NULL REFERENCES mobile_apps(id) ON DELETE CASCADE,
  scan_dir  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, app_id)
);

COMMENT ON TABLE app_scan_dirs
  IS 'Thư mục quét APK tùy chỉnh theo từng nhân viên (user) cho mỗi app.';
