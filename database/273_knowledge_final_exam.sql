-- 273_knowledge_final_exam.sql
-- Thêm cột đánh dấu bài học là "Bài thi tổng kết khoá".
-- Bài thi cuối chỉ mở khi mọi bài tập khác trong khoá đã đạt.
-- Idempotent.

BEGIN;

ALTER TABLE knowledge_lessons
  ADD COLUMN IF NOT EXISTS is_final_exam BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_knowledge_lessons_final_exam
  ON knowledge_lessons (category_id) WHERE is_final_exam = true;

COMMIT;
