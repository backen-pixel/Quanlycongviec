-- 221_knowledge_advanced.sql
-- Mở rộng module Kiến thức với các tính năng nâng cao:
-- 1. Bookmark (yêu thích bài học)
-- 2. Đánh giá sao + bình luận
-- 3. Tags cho bài học
-- 4. Time limit cho bài tập
-- 5. Bài học bắt buộc
-- Idempotent.

BEGIN;

-- ─── Bài học: tags + is_required ────────────────────────────────────────────
ALTER TABLE knowledge_lessons
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_knowledge_lessons_tags ON knowledge_lessons USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_lessons_required ON knowledge_lessons (is_required) WHERE is_required = true;

-- ─── Bài tập: time_limit ────────────────────────────────────────────────────
ALTER TABLE knowledge_exercises
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT;

-- ─── Bookmark ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_lesson_bookmarks (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES knowledge_lessons(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_bookmarks_user ON knowledge_lesson_bookmarks (user_id);

-- ─── Rating + bình luận ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_lesson_ratings (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES knowledge_lessons(id) ON DELETE CASCADE,
  rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_ratings_lesson ON knowledge_lesson_ratings (lesson_id);

-- RLS
ALTER TABLE knowledge_lesson_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_lesson_ratings   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_lesson_bookmarks' AND policyname = 'knowledge_bookmarks_all') THEN
    CREATE POLICY knowledge_bookmarks_all ON knowledge_lesson_bookmarks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_lesson_ratings' AND policyname = 'knowledge_ratings_all') THEN
    CREATE POLICY knowledge_ratings_all ON knowledge_lesson_ratings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
