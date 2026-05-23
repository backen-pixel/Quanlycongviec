-- 217_knowledge_base.sql
-- Module Kiến thức: danh mục, bài học (văn bản + video), bài tập, tiến độ học.
-- Idempotent: chạy nhiều lần không lỗi.

BEGIN;

-- ─── Danh mục (cây phân cấp) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_categories (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT DEFAULT '📚',
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_categories_company
  ON knowledge_categories (company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_parent
  ON knowledge_categories (parent_id);

-- ─── Bài học ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_lessons (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id       UUID NOT NULL REFERENCES knowledge_categories(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  summary           TEXT,
  content_md        TEXT,
  video_url         TEXT,
  video_type        TEXT,  -- youtube | vimeo | upload | null
  duration_minutes  INT,
  sort_order        INT NOT NULL DEFAULT 0,
  is_published      BOOLEAN NOT NULL DEFAULT false,
  published_at      TIMESTAMPTZ,
  target_roles      TEXT[] DEFAULT '{}',
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_lessons_category
  ON knowledge_lessons (category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_lessons_published
  ON knowledge_lessons (is_published, published_at DESC);

-- ─── Bài tập ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'knowledge_exercise_type') THEN
    CREATE TYPE knowledge_exercise_type AS ENUM ('quiz', 'essay', 'checklist');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_exercises (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id       UUID NOT NULL REFERENCES knowledge_lessons(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  instructions    TEXT,
  type            knowledge_exercise_type NOT NULL DEFAULT 'quiz',
  questions       JSONB NOT NULL DEFAULT '{"items":[]}',
  passing_score   NUMERIC(5,2) DEFAULT 70,
  max_attempts    INT,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_exercises_lesson
  ON knowledge_exercises (lesson_id, sort_order);

-- ─── Tiến độ học ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'knowledge_progress_status') THEN
    CREATE TYPE knowledge_progress_status AS ENUM ('not_started', 'in_progress', 'completed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_lesson_progress (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES knowledge_lessons(id) ON DELETE CASCADE,
  status          knowledge_progress_status NOT NULL DEFAULT 'not_started',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  last_viewed_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_lesson_progress_user
  ON knowledge_lesson_progress (user_id);

-- ─── Nộp bài tập ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'knowledge_submission_status') THEN
    CREATE TYPE knowledge_submission_status AS ENUM ('submitted', 'graded', 'passed', 'failed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_exercise_submissions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  exercise_id     UUID NOT NULL REFERENCES knowledge_exercises(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers         JSONB NOT NULL DEFAULT '{}',
  score           NUMERIC(5,2),
  status          knowledge_submission_status NOT NULL DEFAULT 'submitted',
  feedback        TEXT,
  attempt_number  INT NOT NULL DEFAULT 1,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  graded_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_knowledge_submissions_exercise_user
  ON knowledge_exercise_submissions (exercise_id, user_id, submitted_at DESC);

-- RLS (backend service-role)
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_exercise_submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_categories' AND policyname = 'knowledge_categories_all') THEN
    CREATE POLICY knowledge_categories_all ON knowledge_categories FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_lessons' AND policyname = 'knowledge_lessons_all') THEN
    CREATE POLICY knowledge_lessons_all ON knowledge_lessons FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_exercises' AND policyname = 'knowledge_exercises_all') THEN
    CREATE POLICY knowledge_exercises_all ON knowledge_exercises FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_lesson_progress' AND policyname = 'knowledge_lesson_progress_all') THEN
    CREATE POLICY knowledge_lesson_progress_all ON knowledge_lesson_progress FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_exercise_submissions' AND policyname = 'knowledge_exercise_submissions_all') THEN
    CREATE POLICY knowledge_exercise_submissions_all ON knowledge_exercise_submissions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
