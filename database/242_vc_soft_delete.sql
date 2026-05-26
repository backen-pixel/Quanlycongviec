-- Migration 242: Thùng rác (soft delete) cho module Vận chuyển & Lắp đặt
--
-- Mục tiêu: cho phép xóa dự án khỏi module VC nhưng vẫn giữ trong DB,
-- có thể khôi phục lại từ trang Thùng rác VC.
--
-- Cách hoạt động:
--   1. DELETE /api/logistics/projects/:id → set vc_deleted_at = now() (xóa mềm)
--   2. Dashboard VC tự động ẩn các project có vc_deleted_at IS NOT NULL
--   3. GET /api/logistics/trash → liệt kê các project đã xóa mềm
--   4. POST /api/logistics/trash/:id/restore → set vc_deleted_at = NULL
--   5. DELETE /api/logistics/trash/:id → chỉ admin: xóa thật khỏi DB
--
-- Lưu ý: chỉ ảnh hưởng module VC. Module Sản xuất / CRM không quan tâm
-- đến cờ này (project vẫn hiển thị bình thường). Khi admin xóa thật,
-- toàn bộ project mới biến mất khỏi mọi module.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS vc_deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN projects.vc_deleted_at IS
  'Thời điểm dự án bị xóa mềm khỏi module Vận chuyển & Lắp đặt. NULL = hiển thị bình thường.';
COMMENT ON COLUMN projects.vc_deleted_by IS
  'User thực hiện thao tác xóa mềm khỏi module VC.';

CREATE INDEX IF NOT EXISTS idx_projects_vc_deleted_at
  ON projects(vc_deleted_at)
  WHERE vc_deleted_at IS NOT NULL;
