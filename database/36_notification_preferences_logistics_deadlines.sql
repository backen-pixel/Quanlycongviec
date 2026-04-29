-- Tách bật/tắt thông báo hạn nhiệm vụ module Vận chuyển (tasks khi dự án ở shipping/installing/warranty)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS logistics_deadlines BOOLEAN DEFAULT true;

COMMENT ON COLUMN notification_preferences.logistics_deadlines IS 'Hạn nhiệm vụ VC (logistics_task_deadline_* — entity task)';
