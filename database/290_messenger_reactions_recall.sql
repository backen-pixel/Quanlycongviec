-- ============================================================================
--  290 — Messenger reactions & recall (v1.3.6)
--  Yêu cầu: bảng messenger_group_messages đã tồn tại (file 65_messenger_groups.sql)
--  Chạy MỘT LẦN trên Supabase project trùng với SUPABASE_URL của backend.
--  An toàn khi chạy lại (idempotent).
-- ============================================================================

-- 1) reactions JSONB — danh sách [{ user_id, emoji, at }]
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'::jsonb;

UPDATE messenger_group_messages
  SET reactions = '[]'::jsonb
  WHERE reactions IS NULL;

-- 2) Cờ thu hồi tin nhắn (soft delete — giữ row để hiển thị placeholder)
ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE messenger_group_messages
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- 3) FK deleted_by → users(id) — bọc trong DO để không lỗi nếu bảng users
-- nằm ở schema khác hoặc constraint đã có sẵn.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'users')
  THEN
    BEGIN
      ALTER TABLE messenger_group_messages
        DROP CONSTRAINT IF EXISTS messenger_group_messages_deleted_by_fkey;
      ALTER TABLE messenger_group_messages
        ADD CONSTRAINT messenger_group_messages_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Bỏ qua FK deleted_by → users: %', SQLERRM;
    END;
  END IF;
END $$;

-- 4) Indexes — query nhanh tin chưa thu hồi & tra cứu reactions
CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_active
  ON messenger_group_messages (group_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messenger_group_messages_reactions
  ON messenger_group_messages USING GIN (reactions);

-- 5) ⚠ QUAN TRỌNG: nạp lại PostgREST schema cache
-- Nếu KHÔNG có lệnh này, API REST của Supabase sẽ vẫn báo
-- "Could not find the 'reactions' column ... in the schema cache"
-- dù DB đã có cột rồi.
NOTIFY pgrst, 'reload schema';

-- 6) Verify — phải trả về 3 dòng (reactions, deleted_at, deleted_by)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'messenger_group_messages'
  AND column_name  IN ('reactions', 'deleted_at', 'deleted_by')
ORDER BY column_name;
