-- 467: Lý do bắt buộc khi trả Deal về Lead
-- Lưu trên crm_leads để xem lại trên chi tiết / danh sách (không chỉ activity log).
-- Idempotent.

BEGIN;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS revert_to_lead_reason TEXT;

COMMENT ON COLUMN crm_leads.revert_to_lead_reason IS
  'Lý do trả Deal về Lead (bắt buộc khi convert-to-lead). Xóa khi chuyển lại thành Deal.';

COMMIT;
