-- ═══════════════════════════════════════════════════════════════════════════════
-- 722 — projects.sx_received_at / sx_received_by: xác nhận tiếp nhận đơn SX
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--
-- BỐI CẢNH
-- --------
-- Chi tiết dự án SX thêm nút "Xác nhận tiếp nhận" ở đầu trang (cùng hàng với Ghim,
-- Đặt xưởng khác, Đơn phát sinh...). Nút nhấp nháy để nhân viên SX được giao việc
-- không bỏ sót; khi đã bấm thì nút biến mất (thay bằng badge "Đã tiếp nhận").
-- Trước khi bấm, nút nhấp nháy tương tự cũng hiện lại ở đầu tab Bình luận.
--
-- AN TOÀN
-- -------
--   • Chạy lại nhiều lần được (idempotent).
--   • Cột mới, không đụng cột nào khác, không backfill — NULL nghĩa là "chưa tiếp nhận".
--   • Backend tự dò cột: chưa chạy migration thì vẫn chạy như cũ (ẩn nút).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sx_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS sx_received_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_sx_received_by_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_sx_received_by_fkey
      FOREIGN KEY (sx_received_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN projects.sx_received_at IS
  'Thời điểm nhân viên SX bấm "Xác nhận tiếp nhận" dự án. NULL = chưa tiếp nhận — '
  'khi đó nút nhấp nháy hiện ở đầu trang chi tiết và lặp lại ở đầu tab Bình luận.';
COMMENT ON COLUMN projects.sx_received_by IS
  'Người đã bấm "Xác nhận tiếp nhận" (users.id). Xem migration 722.';
