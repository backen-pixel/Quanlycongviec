-- 45: App settings (lưu config thay vì file JSON trên ephemeral filesystem)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
