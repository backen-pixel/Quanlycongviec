-- 219_knowledge_media.sql
-- Mở rộng module Kiến thức: ảnh bìa, đính kèm media (ảnh/video/YouTube/file)
-- cho cả bài học và bài tập.
-- Idempotent.

BEGIN;

-- ─── Bài học ─────────────────────────────────────────────────────────────────
ALTER TABLE knowledge_lessons
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── Bài tập ─────────────────────────────────────────────────────────────────
ALTER TABLE knowledge_exercises
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_type TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── Cấu trúc attachments (JSONB array) ──────────────────────────────────────
-- [
--   { "type": "image",   "url": "https://.../photo.jpg",  "caption": "Sơ đồ pipeline" },
--   { "type": "youtube", "url": "https://youtu.be/abc",   "caption": "Video tutorial" },
--   { "type": "video",   "url": "https://.../clip.mp4",   "caption": "Hướng dẫn" },
--   { "type": "file",    "url": "https://.../doc.pdf",    "name":    "Checklist.pdf" },
--   { "type": "link",    "url": "https://...",            "caption": "Tham khảo thêm" }
-- ]

COMMIT;
