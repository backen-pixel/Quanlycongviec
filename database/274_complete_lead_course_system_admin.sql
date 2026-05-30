-- 274_complete_lead_course_system_admin.sql
-- Hoàn thành khoá Lead cho tài khoản Admin Hệ Thống (admin@tubep.vn).
-- Idempotent: chạy lại an toàn.

BEGIN;

DO $$
DECLARE
  v_user_id    UUID := '0db73a17-8ac2-4aaa-b2a8-c8f90360d77e';
  v_category_id UUID := 'd2000001-0000-0000-0000-000000000001';
  v_now        TIMESTAMPTZ := now();
  v_lesson_ids UUID[];
  v_ex_ids     UUID[];
  v_total_lessons INT;
  v_total_exercises INT;
  v_cert_num   TEXT;
  v_verify     TEXT;
  v_user_name  TEXT;
  v_user_email TEXT;
  v_cat_name   TEXT;
BEGIN
  SELECT full_name, email INTO v_user_name, v_user_email
  FROM users WHERE id = v_user_id;
  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy user Admin Hệ Thống (0db73a17-...)';
  END IF;

  SELECT name INTO v_cat_name FROM knowledge_categories WHERE id = v_category_id;

  SELECT array_agg(id ORDER BY sort_order)
  INTO v_lesson_ids
  FROM knowledge_lessons
  WHERE category_id = v_category_id AND is_published = true;

  v_total_lessons := coalesce(array_length(v_lesson_ids, 1), 0);

  SELECT array_agg(e.id ORDER BY l.sort_order, e.sort_order)
  INTO v_ex_ids
  FROM knowledge_exercises e
  JOIN knowledge_lessons l ON l.id = e.lesson_id
  WHERE l.category_id = v_category_id;

  v_total_exercises := coalesce(array_length(v_ex_ids, 1), 0);

  -- 1) Hoàn thành tất cả bài học
  INSERT INTO knowledge_lesson_progress (user_id, lesson_id, status, started_at, completed_at, last_viewed_at)
  SELECT v_user_id, lid, 'completed', v_now, v_now, v_now
  FROM unnest(v_lesson_ids) AS lid
  ON CONFLICT (user_id, lesson_id) DO UPDATE SET
    status = 'completed',
    completed_at = COALESCE(knowledge_lesson_progress.completed_at, EXCLUDED.completed_at),
    last_viewed_at = v_now;

  -- 2) Xóa bài nộp cũ (khoá Lead) rồi nộp lại passed
  DELETE FROM knowledge_exercise_submissions
  WHERE user_id = v_user_id
    AND exercise_id = ANY(v_ex_ids);

  INSERT INTO knowledge_exercise_submissions (
    exercise_id, user_id, answers, score, status, attempt_number, submitted_at
  )
  SELECT
    e.id,
    v_user_id,
    CASE
      WHEN e.type = 'essay' THEN '{"essay":"Hoàn thành khoá Lead — admin hệ thống (backfill)."}'::jsonb
      WHEN e.type = 'checklist' THEN '{"items":{}}'::jsonb
      ELSE '{}'::jsonb
    END,
    CASE
      WHEN e.passing_score IS NOT NULL AND e.passing_score > 0 THEN GREATEST(e.passing_score::numeric, 100)
      ELSE 100
    END,
    'passed',
    1,
    v_now
  FROM knowledge_exercises e
  JOIN knowledge_lessons l ON l.id = e.lesson_id
  WHERE l.category_id = v_category_id;

  -- 3) Cấp chứng nhận nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_certificates
    WHERE user_id = v_user_id AND category_id = v_category_id
  ) THEN
    v_cert_num := knowledge_next_certificate_number();
    v_verify := knowledge_random_verify_code();

    INSERT INTO knowledge_certificates (
      user_id, category_id, certificate_number, verify_code,
      total_lessons, completed_lessons, avg_exercise_score,
      passed_exercises, total_exercises, metadata, status, issued_at
    ) VALUES (
      v_user_id,
      v_category_id,
      v_cert_num,
      v_verify,
      v_total_lessons,
      v_total_lessons,
      100,
      v_total_exercises,
      v_total_exercises,
      jsonb_build_object(
        'full_name', v_user_name,
        'email', v_user_email,
        'role', 'admin',
        'company_id', null,
        'category_name', v_cat_name,
        'backfill', true,
        'note', '274_complete_lead_course_system_admin'
      ),
      'issued',
      v_now
    );
  ELSE
    UPDATE knowledge_certificates SET
      total_lessons = v_total_lessons,
      completed_lessons = v_total_lessons,
      passed_exercises = v_total_exercises,
      total_exercises = v_total_exercises,
      avg_exercise_score = 100,
      status = 'issued',
      revoked_at = NULL,
      revoked_by = NULL,
      revoked_reason = NULL
    WHERE user_id = v_user_id AND category_id = v_category_id;
  END IF;

  RAISE NOTICE '274: Hoàn thành khoá Lead cho % (%) — % bài, % bài tập.',
    v_user_name, v_user_email, v_total_lessons, v_total_exercises;
END $$;

COMMIT;
