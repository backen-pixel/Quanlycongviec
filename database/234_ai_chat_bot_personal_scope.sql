-- 234_ai_chat_bot_personal_scope.sql
-- Thêm cờ "Chỉ báo cáo 1-1 cá nhân" cho ai_chat_bot_schedules.
--
-- Khi DM bot ↔ user và personal_scope_only=true:
--   * Phạm vi báo cáo bị override → chỉ lấy dữ liệu của CHÍNH user nhận DM.
--   * Bỏ qua user_whitelist / department_whitelist trong schedule.
--   * Mỗi sếp/nhân viên chỉ thấy số liệu của bản thân — phù hợp cho "báo cáo cá nhân".
--
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'personal_scope_only'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN personal_scope_only BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN ai_chat_bot_schedules.personal_scope_only IS
  'Khi true + kênh là DM với bot: phạm vi báo cáo = đúng user nhận DM (bỏ qua user/department whitelist).';
