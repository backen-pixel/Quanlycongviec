-- Mở rộng voice_recordings: số điện thoại, chiều gọi, thời điểm cuộc gọi, id trùng từ mobile
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMPTZ;
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS call_ended_at TIMESTAMPTZ;
ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS external_call_id TEXT;

CREATE INDEX IF NOT EXISTS idx_voice_recordings_phone ON voice_recordings(user_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_ext ON voice_recordings(user_id, external_call_id);

CREATE UNIQUE INDEX IF NOT EXISTS voice_recordings_user_external_unique
  ON voice_recordings(user_id, external_call_id)
  WHERE external_call_id IS NOT NULL AND btrim(external_call_id) <> '';
