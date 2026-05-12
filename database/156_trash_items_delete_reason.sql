-- ═══════════════════════════════════════════════════════════════
-- 156. Thêm lý do xóa vào trash_items
-- Cho phép lưu lý do khi xóa lead/deal → hiển thị trên Thùng rác.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE trash_items ADD COLUMN IF NOT EXISTS delete_reason text;
