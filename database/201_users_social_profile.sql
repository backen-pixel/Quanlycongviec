-- Bảng tin nội bộ: thêm cột ảnh bìa + tiểu sử ngắn cho trang cá nhân.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cover_url text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN users.cover_url IS 'Ảnh bìa (banner) cho trang cá nhân bảng tin nội bộ';
COMMENT ON COLUMN users.bio       IS 'Mô tả ngắn hiển thị trên trang cá nhân bảng tin nội bộ (<= 500 ký tự)';

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_bio_len CHECK (bio IS NULL OR char_length(bio) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
