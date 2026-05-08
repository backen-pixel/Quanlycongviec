-- 143: Lưu "tombstone" cho ghi âm bị xóa, để CRM mobile không tự upload lại
-- file đó sau khi cài lại app / mất cache local.
--
-- Khi DELETE /voice-recordings/:id chạy, backend insert thêm 1 row tại đây với
-- (user_id, file_name, file_size). Endpoint /voice-recordings/exists và
-- /voice-recordings/bulk-check sẽ trả `exists=true` cho các record này, nên
-- background sync trên Android sẽ bỏ qua.
--
-- User vẫn có thể bấm "Tải lại" trên màn hình "Bản ghi trên máy" — endpoint POST
-- /voice-recordings sẽ insert bản mới + xóa tombstone tương ứng.
CREATE TABLE IF NOT EXISTS voice_recordings_deleted (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  original_id uuid,
  device_label text,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_recordings_deleted_user_name_idx
  ON voice_recordings_deleted (user_id, file_name);

-- Khoá duy nhất theo (user, name, size). Cùng tên có thể xuất hiện nhiều file size khác nhau,
-- nhưng cùng size thì coi là cùng "danh tính" → chỉ giữ 1 tombstone (DELETE…INSERT chồng = upsert).
CREATE UNIQUE INDEX IF NOT EXISTS voice_recordings_deleted_user_name_size_uniq
  ON voice_recordings_deleted (user_id, file_name, file_size);

ALTER TABLE voice_recordings_deleted ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_recordings_deleted_service_all" ON voice_recordings_deleted;
CREATE POLICY "voice_recordings_deleted_service_all"
  ON voice_recordings_deleted
  FOR ALL
  USING (true);
