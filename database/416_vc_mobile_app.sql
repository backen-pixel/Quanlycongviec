-- Đăng ký app mobile Vận chuyển lắp đặt (vc-mobile) cho chức năng Cập nhật app
INSERT INTO mobile_apps (app_key, display_name, android_package, platform, icon_url)
VALUES (
  'vc-mobile',
  'Vận chuyển lắp đặt',
  'vn.tubeppro.vcmobile',
  'android',
  NULL
)
ON CONFLICT (app_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  android_package = EXCLUDED.android_package,
  updated_at = NOW();

-- Bản phát hành APK ban đầu (chưa có file — upload sau khi build)
INSERT INTO app_releases (app_id, channel, update_type, version, version_code, is_active, release_notes)
SELECT id, 'production', 'apk', '1.0.0', 1, false, 'Phiên bản đầu — app Vận chuyển lắp đặt'
FROM mobile_apps WHERE app_key = 'vc-mobile'
ON CONFLICT DO NOTHING;
