-- Preference hiển thị bình luận trên màn hình + bổ sung cột prefs code đang expect nhưng DB thiếu.
-- comment_show_on_screen: bật = hiện thread trên deal/dự án/task; tắt = chỉ còn trong chuông thông báo.

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS browser_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS task_assigned boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS task_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deadline_warning boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comment_added boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comment_show_on_screen boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stage_changed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deal_won boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approval_request boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS checklist_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS lead_assigned boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS order_confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_overdue boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS logistics_deadlines boolean NOT NULL DEFAULT true;
