-- 222_knowledge_seed_advanced.sql
-- Bổ sung tags, is_required, time_limit cho dữ liệu mẫu hiện có.
-- Idempotent: UPDATE WHERE id, chạy lại không nhân đôi.

BEGIN;

-- ─── TAGS + REQUIRED cho bài học ──────────────────────────────────────────
UPDATE knowledge_lessons SET
  tags        = ARRAY['onboarding', 'newbie', 'giao-dien'],
  is_required = true
WHERE id = 'b0000001-0000-0000-0000-000000000001';

UPDATE knowledge_lessons SET
  tags        = ARRAY['bao-mat', 'onboarding', 'mat-khau'],
  is_required = true
WHERE id = 'b0000001-0000-0000-0000-000000000002';

UPDATE knowledge_lessons SET
  tags = ARRAY['crm', 'lead', 'sales']
WHERE id = 'b0000001-0000-0000-0000-000000000003';

UPDATE knowledge_lessons SET
  tags = ARRAY['crm', 'deal', 'sales', 'pipeline']
WHERE id = 'b0000001-0000-0000-0000-000000000004';

UPDATE knowledge_lessons SET
  tags = ARRAY['crm', 'bao-gia', 'pdf', 'sales']
WHERE id = 'b0000001-0000-0000-0000-000000000005';

UPDATE knowledge_lessons SET
  tags        = ARRAY['kpi', 'sales', 'bao-cao'],
  is_required = true
WHERE id = 'b0000001-0000-0000-0000-000000000006';

UPDATE knowledge_lessons SET
  tags = ARRAY['dashboard', 'crm', 'bao-cao']
WHERE id = 'b0000001-0000-0000-0000-000000000007';

UPDATE knowledge_lessons SET
  tags = ARRAY['san-xuat', 'ban-giao', 'crm']
WHERE id = 'b0000001-0000-0000-0000-000000000008';

-- ─── TIME LIMIT cho bài tập ───────────────────────────────────────────────
-- Quiz "Kiểm tra: Tạo Lead" — 5 phút cho 4 câu
UPDATE knowledge_exercises SET
  time_limit_minutes = 5,
  max_attempts       = 3
WHERE id = 'c0000001-0000-0000-0000-000000000001';

-- Quiz "Chuyển Lead → Deal" — 3 phút cho 3 câu
UPDATE knowledge_exercises SET
  time_limit_minutes = 3,
  max_attempts       = 3
WHERE id = 'c0000001-0000-0000-0000-000000000002';

-- Quiz giao diện — 2 phút
UPDATE knowledge_exercises SET
  time_limit_minutes = 2,
  max_attempts       = 5
WHERE id = 'c0000001-0000-0000-0000-000000000005';

COMMIT;
