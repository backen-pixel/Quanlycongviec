-- Bài bảng tin: URL video ngoài (tuỳ chọn, cạnh image_url)
-- Idempotent.

ALTER TABLE internal_social_posts
  ADD COLUMN IF NOT EXISTS video_url text;

COMMENT ON COLUMN internal_social_posts.video_url IS 'URL video (mp4/webm/...) hiển thị nhúng trên bài';
