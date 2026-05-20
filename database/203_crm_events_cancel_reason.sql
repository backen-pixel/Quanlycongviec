-- ═══════════════════════════════════════════════════════════════
-- 203. CRM Events — cancel_reason
-- Lưu lý do khi user hủy sự kiện (status='cancelled') trên trang Sự kiện.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE crm_events
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN crm_events.cancel_reason IS 'Lý do hủy (chỉ áp dụng khi status=cancelled)';
