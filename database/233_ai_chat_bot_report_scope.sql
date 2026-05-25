-- 233_ai_chat_bot_report_scope.sql
-- Mở rộng phạm vi báo cáo công ty: cho phép giới hạn theo PHÒNG BAN + NHÂN VIÊN.
--
-- Logic suy diễn assignee IDs (trong aiReportTools.js):
--   1) Nếu user_whitelist có giá trị → dùng đúng các user đó.
--   2) Ngược lại, nếu department_whitelist có giá trị → lấy mọi user đang active thuộc phòng ban đó.
--   3) Ngược lại → lấy mọi assignee của crm_leads thuộc company (giữ nguyên hành vi cũ).
--
-- Idempotent — an toàn chạy lại.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'department_whitelist'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN department_whitelist UUID[] DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'user_whitelist'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN user_whitelist UUID[] DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN ai_chat_bot_schedules.department_whitelist IS
  'NULL = mọi phòng ban; có giá trị = chỉ lấy dữ liệu của nhân viên thuộc phòng ban này (suy ra user_ids).';

COMMENT ON COLUMN ai_chat_bot_schedules.user_whitelist IS
  'NULL = tự suy từ department_whitelist hoặc lấy tất cả; có giá trị = chỉ lấy dữ liệu của các user này (ưu tiên cao nhất).';
