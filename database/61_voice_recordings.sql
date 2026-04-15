-- Bản thử: ghi âm đồng bộ lên web (upload từ web hoặc app mobile gọi API)
CREATE TABLE IF NOT EXISTS voice_recordings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT DEFAULT 0,
  duration_sec DOUBLE PRECISION,
  source TEXT DEFAULT 'web',
  device_label TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user_created ON voice_recordings(user_id, created_at DESC);

ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_recordings_service_all" ON voice_recordings FOR ALL USING (true);
