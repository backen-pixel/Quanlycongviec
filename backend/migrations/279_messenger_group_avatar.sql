-- Thêm cột avatar cho nhóm chat (Messenger). Lưu URL ảnh public (Supabase Storage hoặc /uploads).
ALTER TABLE messenger_groups
  ADD COLUMN IF NOT EXISTS avatar TEXT;
