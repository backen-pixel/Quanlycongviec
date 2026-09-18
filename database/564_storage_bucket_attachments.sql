-- ═══════════════════════════════════════════════════════════════
-- 564. Bucket lưu tệp đính kèm
--
-- Dùng chung cho Facebook image sets, Drive và Zalo. Công khai đọc để giao
-- diện nhúng thẳng ảnh; ghi thì chỉ backend (service role) làm được.
--
-- Giới hạn 50 MB ở tầng bucket cho các tính năng khác; riêng Zalo tự chặn ở
-- 10 MB trong zaloAttachmentCopy.js.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', true, 52428800)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = GREATEST(storage.buckets.file_size_limit, EXCLUDED.file_size_limit);
