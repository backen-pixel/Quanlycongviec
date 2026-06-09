-- Đăng ký app demo test cập nhật OTA/APK (thư mục project: demo-mobile/dist)
INSERT INTO mobile_apps (app_key, display_name, android_package, platform)
VALUES ('tubep-demo', 'TuBep Demo', 'vn.tubeppro.tubepdemo', 'android')
ON CONFLICT (app_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      android_package = EXCLUDED.android_package;

COMMENT ON TABLE mobile_apps IS 'Registry app — APK quét từ {folder}/dist; tubep-demo dùng folder demo-mobile.';
