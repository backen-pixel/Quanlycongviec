-- 400: Thêm cột notes cho file_attachments.
-- Sửa lỗi Postgres "column file_attachments.notes does not exist" lặp lại liên tục
-- (POST /projects/:id/documents/bulk khi upload văn bản/ghi chú kèm file, và khi
-- projectDealBundle.js gộp danh sách file đính kèm của các task trong dự án/deal).
-- Trước đây code (projects.js, projectDealBundle.js) đã select/insert cột "notes"
-- trên file_attachments nhưng cột này chưa từng được tạo trong schema.

ALTER TABLE public.file_attachments ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.file_attachments.notes IS
  'Ghi chú / nội dung văn bản đính kèm theo file (vd: văn bản ghi chú dạng text do người dùng nhập khi upload).';
