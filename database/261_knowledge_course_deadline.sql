-- 261_knowledge_course_deadline.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- DEADLINE CHO KHOÁ HỌC (knowledge_categories)
--
--   - deadline_mode = 'none'     → không áp deadline
--   - deadline_mode = 'fixed'    → cố định ngày (cùng 1 deadline cho mọi học viên)
--   - deadline_mode = 'relative' → tính từ ngày học viên bắt đầu khoá (lesson_progress.started_at sớm nhất)
--                                  → mỗi học viên có deadline riêng
--
-- Ghi nhận on_time / late:
--   - knowledge_lesson_progress.completed_late BOOLEAN
--   - knowledge_exercise_submissions.submitted_late BOOLEAN
--   Backend sẽ tự cập nhật khi user hoàn thành / submit, dựa trên deadline lúc đó.
--
-- Lịch sử thay đổi deadline:
--   - knowledge_category_deadline_history (mỗi lần admin sửa → 1 dòng)
--
-- Idempotent: chạy lại nhiều lần đều an toàn.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Cột deadline cho danh mục ───────────────────────────────────────────────
ALTER TABLE knowledge_categories
  ADD COLUMN IF NOT EXISTS deadline_mode          TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deadline_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deadline_duration_days INT,
  ADD COLUMN IF NOT EXISTS deadline_note          TEXT;

-- Ràng buộc giá trị deadline_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_categories_deadline_mode_chk'
  ) THEN
    ALTER TABLE knowledge_categories
      ADD CONSTRAINT knowledge_categories_deadline_mode_chk
      CHECK (deadline_mode IN ('none','fixed','relative'));
  END IF;
END $$;

COMMENT ON COLUMN knowledge_categories.deadline_mode IS
  'Kiểu deadline: none (không hạn) | fixed (ngày cụ thể) | relative (số ngày kể từ ngày bắt đầu học)';
COMMENT ON COLUMN knowledge_categories.deadline_at IS
  'Hạn chót cố định khi deadline_mode = fixed';
COMMENT ON COLUMN knowledge_categories.deadline_duration_days IS
  'Số ngày tính từ ngày bắt đầu khi deadline_mode = relative';
COMMENT ON COLUMN knowledge_categories.deadline_note IS
  'Ghi chú admin về deadline (lý do gia hạn, …)';

-- ── Lịch sử thay đổi deadline ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_category_deadline_history (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id             UUID NOT NULL REFERENCES knowledge_categories(id) ON DELETE CASCADE,
  changed_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  prev_mode               TEXT,
  prev_deadline_at        TIMESTAMPTZ,
  prev_duration_days      INT,
  new_mode                TEXT,
  new_deadline_at         TIMESTAMPTZ,
  new_duration_days       INT,
  note                    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kcdh_category_created
  ON knowledge_category_deadline_history(category_id, created_at DESC);

ALTER TABLE knowledge_category_deadline_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'knowledge_category_deadline_history'
      AND policyname = 'kcdh_read_all_authenticated'
  ) THEN
    CREATE POLICY kcdh_read_all_authenticated
      ON knowledge_category_deadline_history FOR SELECT
      TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'knowledge_category_deadline_history'
      AND policyname = 'kcdh_write_service'
  ) THEN
    CREATE POLICY kcdh_write_service
      ON knowledge_category_deadline_history FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Cờ on_time / late cho tiến độ học ───────────────────────────────────────
ALTER TABLE knowledge_lesson_progress
  ADD COLUMN IF NOT EXISTS completed_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_snapshot TIMESTAMPTZ;

COMMENT ON COLUMN knowledge_lesson_progress.completed_late IS
  'true nếu completed_at > deadline_snapshot (học sau hạn quy định)';
COMMENT ON COLUMN knowledge_lesson_progress.deadline_snapshot IS
  'Deadline áp dụng cho học viên khi hoàn thành bài học này (snapshot)';

ALTER TABLE knowledge_exercise_submissions
  ADD COLUMN IF NOT EXISTS submitted_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_snapshot TIMESTAMPTZ;

COMMENT ON COLUMN knowledge_exercise_submissions.submitted_late IS
  'true nếu submitted_at > deadline_snapshot';
COMMENT ON COLUMN knowledge_exercise_submissions.deadline_snapshot IS
  'Deadline áp dụng cho học viên khi nộp bài (snapshot)';

COMMIT;

-- ── Kiểm tra nhanh sau khi chạy ─────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'knowledge_categories' AND column_name LIKE 'deadline%';
-- SELECT * FROM knowledge_category_deadline_history ORDER BY created_at DESC LIMIT 10;
