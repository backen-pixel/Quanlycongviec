-- 621: Trang Quản lý lỗi — lỗi VẬN HÀNH và lỗi HỆ THỐNG.
--
-- Dùng lại bảng project_incidents sẵn có (đang giữ sự cố dự án) thay vì dựng bảng mới:
-- cùng vòng đời (ai báo → ai nhận → xử lý → xong), cùng gắn dự án, và đã có route đọc/ghi.
-- Phân biệt hai loại bằng error_type_id → shared_workspace_error_types.source_kind.

-- ── 1. Cột mới ────────────────────────────────────────────────────────────────
ALTER TABLE project_incidents
  ADD COLUMN IF NOT EXISTS error_type_id UUID REFERENCES shared_workspace_error_types(id),
  ADD COLUMN IF NOT EXISTS assignee_id   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS company_id    UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS deadline      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ;

-- Lỗi HỆ THỐNG không thuộc dự án nào: nút hỏng ở màn hình Cài đặt thì gắn vào dự án nào?
-- Ép có project_id sẽ buộc người báo chọn bừa một dự án, và thống kê theo dự án hoá sai.
ALTER TABLE project_incidents ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON COLUMN project_incidents.error_type_id IS
  'Loại lỗi (shared_workspace_error_types). source_kind quyết định đây là lỗi vận hành hay hệ thống.';
COMMENT ON COLUMN project_incidents.assignee_id IS 'Người đang xử lý lỗi.';
COMMENT ON COLUMN project_incidents.deadline IS 'Hạn xử lý — dùng cho bảng Deadline và Lịch.';

-- ── 2. Bốn trạng thái ─────────────────────────────────────────────────────────
-- tiep_nhan → dang_lam → hoan_thanh, và dang_cho khi vướng chờ bên khác.
-- Dữ liệu cũ: open → tiep_nhan; resolved/closed → hoan_thanh.
--
-- PHẢI gỡ ràng buộc CŨ trước khi UPDATE: nó chỉ cho open/in_progress/resolved/closed,
-- nên dòng đầu tiên đổi sang 'tiep_nhan' là bị chặn ngay và cả migration dừng lại.
ALTER TABLE project_incidents DROP CONSTRAINT IF EXISTS project_incidents_status_check;

UPDATE project_incidents SET status = 'tiep_nhan'  WHERE status IN ('open', 'new', 'reported');
UPDATE project_incidents SET status = 'dang_lam'   WHERE status IN ('in_progress', 'processing');
UPDATE project_incidents SET status = 'dang_cho'   WHERE status IN ('waiting', 'on_hold', 'blocked');
UPDATE project_incidents SET status = 'hoan_thanh' WHERE status IN ('resolved', 'closed', 'done');

-- Đặt lại ràng buộc theo đúng bốn trạng thái. Giữ ràng buộc chứ không bỏ hẳn: thiếu nó thì
-- một lỗi chính tả trong mã nguồn sẽ lặng lẽ sinh ra trạng thái lạ, và thẻ biến mất khỏi mọi
-- cột kanban mà không ai biết vì sao.
ALTER TABLE project_incidents
  ADD CONSTRAINT project_incidents_status_check
  CHECK (status IN ('tiep_nhan', 'dang_lam', 'dang_cho', 'hoan_thanh'));

-- ── 3. Bình luận trên từng lỗi ────────────────────────────────────────────────
-- Bảng RIÊNG chứ không nhồi vào project_comments: bình luận lỗi phải gắn incident_id để
-- bắn thông báo đúng người báo lỗi, và để xoá lỗi thì bình luận đi theo.
CREATE TABLE IF NOT EXISTS project_incident_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES project_incidents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  parent_id   UUID REFERENCES project_incident_comments(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident ON project_incident_comments(incident_id, created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_status   ON project_incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_assignee ON project_incidents(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_company  ON project_incidents(company_id)  WHERE company_id IS NOT NULL;

-- ── 4. Hai loại lỗi mặc định ──────────────────────────────────────────────────
-- Ràng buộc cũ chỉ cho customer_request/employee_error (hai nhóm của trang Phát sinh).
-- Mở rộng chứ không bỏ: còn ràng buộc thì gõ sai slug sẽ báo lỗi ngay, bỏ đi thì loại lỗi
-- rơi vào nhóm không thuộc trang nào và biến mất khỏi mọi danh sách.
ALTER TABLE shared_workspace_error_types
  DROP CONSTRAINT IF EXISTS shared_workspace_error_types_source_kind_check;
ALTER TABLE shared_workspace_error_types
  ADD CONSTRAINT shared_workspace_error_types_source_kind_check
  CHECK (source_kind IN ('customer_request', 'employee_error', 'loi_van_hanh', 'loi_he_thong'));

-- company_id NULL = dùng chung mọi công ty. Mỗi công ty tự thêm loại con ở
-- /management/shared-workspace-settings.
INSERT INTO shared_workspace_error_types (id, company_id, name, slug, source_kind, is_active, sort_order)
VALUES
  ('a1000002-0000-4000-8000-000000000001', NULL, 'Lỗi vận hành', 'loi_van_hanh', 'loi_van_hanh', TRUE, 10),
  ('a1000002-0000-4000-8000-000000000002', NULL, 'Lỗi hệ thống', 'loi_he_thong', 'loi_he_thong', TRUE, 20)
ON CONFLICT (id) DO NOTHING;
