-- Migration 243: Thêm cột lý do xóa cho thùng rác Vận chuyển & Lắp đặt
--
-- Phụ thuộc: 242_vc_soft_delete.sql (đã thêm vc_deleted_at, vc_deleted_by)
--
-- Lý do xóa được hiển thị trên trang Thùng rác VC để admin biết người
-- thực hiện đã giải thích vì sao loại dự án khỏi Kanban.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_delete_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN projects.vc_delete_reason IS
  'Lý do xóa mềm dự án khỏi module Vận chuyển & Lắp đặt (do người xóa nhập).';
