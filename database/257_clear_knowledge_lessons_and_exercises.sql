-- 257_clear_knowledge_lessons_and_exercises.sql
-- Xóa toàn bộ dữ liệu bài học và bài tập (kể cả tiến độ học & bài nộp).
-- GIỮ LẠI: danh mục (knowledge_categories).
-- Idempotent: chạy lại nhiều lần đều an toàn.

BEGIN;

-- 1) Bài nộp (phụ thuộc knowledge_exercises)
DELETE FROM knowledge_exercise_submissions;

-- 2) Tiến độ học (phụ thuộc knowledge_lessons)
DELETE FROM knowledge_lesson_progress;

-- 3) Bookmark + rating (chỉ xóa nếu bảng tồn tại — migration 221 có thể chưa chạy)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='knowledge_lesson_bookmarks') THEN
    EXECUTE 'DELETE FROM knowledge_lesson_bookmarks';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='knowledge_lesson_ratings') THEN
    EXECUTE 'DELETE FROM knowledge_lesson_ratings';
  END IF;
END $$;

-- 4) Bài tập
DELETE FROM knowledge_exercises;

-- 5) Bài học (ON DELETE CASCADE sẽ dọn nốt nếu còn bản ghi liên quan)
DELETE FROM knowledge_lessons;

COMMIT;

-- Kiểm tra kết quả:
-- SELECT 'lessons',COUNT(*) FROM knowledge_lessons
-- UNION ALL SELECT 'exercises',COUNT(*) FROM knowledge_exercises
-- UNION ALL SELECT 'progress',COUNT(*) FROM knowledge_lesson_progress
-- UNION ALL SELECT 'submissions',COUNT(*) FROM knowledge_exercise_submissions
-- UNION ALL SELECT 'categories',COUNT(*) FROM knowledge_categories;
