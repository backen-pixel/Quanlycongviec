-- ═══════════════════════════════════════════════════════════════
-- 310_app_update_registry.sql — Server cập nhật App Android (nhiều app)
--   - mobile_apps   : registry các app nội bộ (crm-mobile, sx-mobile, …)
--   - app_releases  : phiên bản phát hành (full APK hoặc OTA jsbundle)
--   - app_update_logs: nhật ký check/download/installed (analytics, tuỳ chọn)
-- ═══════════════════════════════════════════════════════════════

-- ── Registry các app ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobile_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key TEXT NOT NULL UNIQUE,            -- 'crm-mobile', 'sx-mobile', …
  display_name TEXT NOT NULL,              -- 'TuBep CRM', 'Xưởng SX'
  android_package TEXT,                    -- 'vn.tubeppro.crmobile'
  platform TEXT NOT NULL DEFAULT 'android',-- android | ios
  icon_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Các bản phát hành ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES mobile_apps(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'production',   -- production | staging | …
  update_type TEXT NOT NULL DEFAULT 'apk',      -- apk | jsbundle
  version TEXT NOT NULL,                         -- '1.3.35' (semver hiển thị)
  version_code INTEGER,                          -- so sánh APK (Android versionCode)
  runtime_version TEXT,                          -- cho jsbundle (expo-updates)
  storage_path TEXT,                             -- đường dẫn trong bucket app-releases
  file_url TEXT,                                 -- public URL trong Supabase Storage
  external_url TEXT,                             -- fallback APK lớn host ngoài (Drive/GitHub)
  manifest JSONB,                                -- manifest expo-updates (jsbundle)
  file_size BIGINT,
  sha256 TEXT,
  is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,   -- bắt buộc cập nhật
  is_active BOOLEAN NOT NULL DEFAULT TRUE,       -- đang phát hành
  release_notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_releases_lookup
  ON app_releases (app_id, channel, update_type, is_active, version_code DESC);
CREATE INDEX IF NOT EXISTS idx_app_releases_runtime
  ON app_releases (app_id, channel, runtime_version, is_active, created_at DESC)
  WHERE update_type = 'jsbundle';

-- ── Nhật ký cập nhật (analytics) ────────────────────────────────
CREATE TABLE IF NOT EXISTS app_update_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES mobile_apps(id) ON DELETE CASCADE,
  from_version TEXT,
  to_version TEXT,
  device_id TEXT,
  platform TEXT,
  action TEXT NOT NULL,            -- check | download | installed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_update_logs_app
  ON app_update_logs (app_id, action, created_at DESC);

-- ── Seed 2 app hiện có ──────────────────────────────────────────
INSERT INTO mobile_apps (app_key, display_name, android_package, platform)
VALUES
  ('crm-mobile', 'TuBep CRM', 'vn.tubeppro.crmobile', 'android'),
  ('sx-mobile',  'Xưởng SX',  'vn.tubeppro.sxmobile', 'android')
ON CONFLICT (app_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      android_package = EXCLUDED.android_package;

COMMENT ON TABLE mobile_apps IS 'Registry app Android nội bộ cho hệ thống tự cập nhật (OTA).';
COMMENT ON TABLE app_releases IS 'Phiên bản phát hành: full APK hoặc OTA jsbundle (expo-updates).';
COMMENT ON TABLE app_update_logs IS 'Nhật ký kiểm tra/tải/cài cập nhật app.';
