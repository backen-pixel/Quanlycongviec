-- Bucket Supabase Storage cho ghi âm cuộc gọi (API upload vào đây, thư mục = user_id trong key)
-- Chạy trên Supabase → SQL Editor. Đổi public = false nếu chỉ dùng signed URL (cần chỉnh backend).

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ghi-am', 'ghi-am', true, 83886080)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

-- Đọc file công khai (phát audio trên web / app qua URL public)
DROP POLICY IF EXISTS "ghi_am_objects_public_read" ON storage.objects;
CREATE POLICY "ghi_am_objects_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ghi-am');

-- Ghi bằng service role không cần policy INSERT; nếu upload trực tiếp từ client (JWT), bật thêm policy INSERT.
