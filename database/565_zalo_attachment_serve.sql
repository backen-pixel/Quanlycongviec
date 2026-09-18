-- ═══════════════════════════════════════════════════════════════
-- 565. ZALO — phục vụ tệp đính kèm qua chính CRM
--
-- Link công khai của Supabase Storage có hai vấn đề:
--   1. Nó mang địa chỉ nội bộ (http://localhost:8000) — trình duyệt chặn vì
--      trang CRM chạy HTTPS, và máy ngoài cũng không truy cập được.
--   2. Công khai hoàn toàn: ai có link là xem được ảnh khách hàng, đi vòng qua
--      toàn bộ phân quyền Zalo cá nhân vừa dựng.
--
-- Nên lưu ĐƯỜNG DẪN trong kho thay vì URL, rồi phục vụ qua endpoint có kiểm
-- quyền của CRM.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE zalo_messages
  ADD COLUMN IF NOT EXISTS stored_path TEXT,
  ADD COLUMN IF NOT EXISTS stored_bucket TEXT;

-- Bucket không cần công khai nữa: CRM đọc bằng service role rồi trả về
UPDATE storage.buckets SET public = false WHERE id = 'attachments';
