-- 394: Ghi chú — broadcast dùng cột recipient_user_ids sẵn có (personal_scope_only=false).
-- Không cần ALTER nếu đã có recipient_user_ids từ migration 233+.
-- Code backend tự resolve notify_system_admins + notify_team → recipient_user_ids.

COMMENT ON COLUMN ai_chat_bot_schedules.recipient_user_ids IS
  'personal_scope_only=true: fanout DM cá nhân (dữ liệu riêng). '
  'personal_scope_only=false: gửi thêm bản copy cùng nội dung báo cáo qua DM bot (admin, team IT…).';
