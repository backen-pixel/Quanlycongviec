-- 260_knowledge_certificate_badge.sql
-- Bổ sung cho hệ chứng nhận:
--   1. Cấu hình HUY CHƯƠNG (badge image) cho từng danh mục (khoá học)
--   2. Cờ "Bắt buộc hoàn thành tất cả bài tập" mới được cấp chứng nhận
--   3. Template tuỳ biến (chữ ký, footer, màu sắc, ...) — JSONB tự do
-- Idempotent: chạy lại nhiều lần đều an toàn.

BEGIN;

-- ─── Thêm cột vào knowledge_categories ──────────────────────────────────────
ALTER TABLE knowledge_categories
  ADD COLUMN IF NOT EXISTS badge_image_url           TEXT,
  ADD COLUMN IF NOT EXISTS require_all_exercises_passed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS certificate_template      JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN knowledge_categories.badge_image_url IS
  'URL ảnh huy chương (medal/badge) hiển thị trên chứng nhận khi học viên hoàn thành';
COMMENT ON COLUMN knowledge_categories.require_all_exercises_passed IS
  'Nếu true → học viên phải đạt (passed) tất cả bài tập trong khoá mới được cấp chứng nhận';
COMMENT ON COLUMN knowledge_categories.certificate_template IS
  'Tuỳ biến mẫu chứng nhận: { signature_name, signature_title, footer_note, accent_color, ... }';

-- ─── Thêm cột badge snapshot vào knowledge_certificates ────────────────────
-- Lưu lại URL huy chương tại thời điểm cấp (phòng admin đổi ảnh sau này).
ALTER TABLE knowledge_certificates
  ADD COLUMN IF NOT EXISTS badge_image_url TEXT;

COMMENT ON COLUMN knowledge_certificates.badge_image_url IS
  'Snapshot URL ảnh huy chương tại thời điểm cấp chứng nhận';

COMMIT;

-- Kiểm tra:
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--   WHERE table_name = 'knowledge_categories'
--     AND column_name IN ('badge_image_url','require_all_exercises_passed','certificate_template');
