-- 225_ai_chat_bot_schedules_prompt_kind_nullable.sql
-- Sửa hậu quả của migration 223: cột prompt_kind đặt NOT NULL + CHECK enum,
-- nhưng code mới (sau 224) dùng playbook_id thay thế nên cần insert prompt_kind = NULL.
-- Lỗi gặp phải:
--   null value in column "prompt_kind" of relation "ai_chat_bot_schedules" violates not-null constraint
--
-- Idempotent — an toàn chạy lại.

-- 1) Bỏ NOT NULL (giữ cột lại cho backward-compat / debug)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules'
      AND column_name = 'prompt_kind'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules ALTER COLUMN prompt_kind DROP NOT NULL;
  END IF;
END $$;

-- 2) Bỏ DEFAULT để insert NULL không bị ép thành 'daily_brief'
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules'
      AND column_name = 'prompt_kind'
      AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE ai_chat_bot_schedules ALTER COLUMN prompt_kind DROP DEFAULT;
  END IF;
END $$;

-- 3) Drop CHECK constraint (nếu có) — playbook_id mới là cốt lõi, prompt_kind chỉ còn vai trò debug
DO $$
DECLARE c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'ai_chat_bot_schedules'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%prompt_kind%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_chat_bot_schedules DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- 4) Đảm bảo playbook_id có (phòng trường hợp 224 chưa chạy)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'playbook_id'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN playbook_id UUID REFERENCES ai_chat_bot_playbooks(id) ON DELETE RESTRICT;
  END IF;
END $$;
