-- 197_notifications_entity_id_text.sql
-- Giao việc CRM dùng id BIGINT; notifications.entity_id trước đây là UUID → insert thất bại.
-- Chuyển entity_id sang TEXT để lưu UUID (lead/deal/…) và id số (crm_assignment, …).

BEGIN;

ALTER TABLE notifications
  ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT;

COMMENT ON COLUMN notifications.entity_id IS
  'Id thực thể (UUID dạng text, hoặc id số crm_assignments…). Với giao việc CRM xem thêm metadata.assignment_id.';

COMMIT;
