-- 238_ai_chat_bot_region_scope.sql
-- Thêm region_whitelist cho ai_chat_bot_schedules — cho phép lọc dữ liệu cảnh báo
-- theo KHU VỰC (company_regions). Khi có giá trị: chỉ tính các nhân viên thuộc
-- các khu vực được chọn (qua bảng user_company_regions).
--
-- Logic suy diễn (trong aiBotSender.js → resolveScopeUserIdsForChannel):
--   * Hợp các nguồn whitelist (union):
--       user_whitelist
--       + users của department_whitelist
--       + users của company_whitelist (trực tiếp + qua phòng ban thuộc cty)
--       + users của region_whitelist (qua user_company_regions)
--   * Nếu MỌI whitelist rỗng → giữ scope mặc định = thành viên kênh.
--
-- Idempotent.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_bot_schedules' AND column_name = 'region_whitelist'
  ) THEN
    ALTER TABLE ai_chat_bot_schedules
      ADD COLUMN region_whitelist UUID[] DEFAULT NULL;
  END IF;
END $$;

COMMENT ON COLUMN ai_chat_bot_schedules.region_whitelist IS
  'NULL = mọi khu vực; có giá trị = chỉ lấy dữ liệu của nhân viên thuộc các khu vực này (qua user_company_regions).';
