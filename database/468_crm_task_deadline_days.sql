-- 468: Lưu offset hạn trên crm_tasks để chạy deadline tuần tự
-- (NV sau chỉ bắt đầu đếm khi NV trước hoàn thành).

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS deadline_days INT DEFAULT 0;

COMMENT ON COLUMN crm_tasks.deadline_days IS
  'Số ngày hạn (offset). Khi NV trước hoàn thành, deadline tuyệt đối = now + deadline_days nếu > 0 và chưa có deadline.';

UPDATE crm_tasks
SET deadline_days = 0
WHERE deadline_days IS NULL;
