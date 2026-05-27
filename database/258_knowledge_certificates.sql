-- 258_knowledge_certificates.sql
-- Chứng nhận hoàn thành khoá học (= hoàn thành toàn bộ bài học của một danh mục).
-- Idempotent: chạy lại nhiều lần đều an toàn.

BEGIN;

-- ─── Bảng chứng nhận ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_certificates (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id          UUID NOT NULL REFERENCES knowledge_categories(id) ON DELETE CASCADE,
  certificate_number   TEXT NOT NULL UNIQUE,         -- vd: CN-2026-000001
  verify_code          TEXT NOT NULL UNIQUE,         -- mã ngắn để xác minh public
  total_lessons        INT NOT NULL DEFAULT 0,       -- snapshot số bài tại thời điểm cấp
  completed_lessons    INT NOT NULL DEFAULT 0,
  avg_exercise_score   NUMERIC(5,2),                  -- điểm trung bình các bài tập trong khoá
  passed_exercises     INT NOT NULL DEFAULT 0,
  total_exercises      INT NOT NULL DEFAULT 0,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb, -- snapshot {full_name, category_name, role, company_id, ...}
  status               TEXT NOT NULL DEFAULT 'issued',     -- issued | revoked
  revoked_at           TIMESTAMPTZ,
  revoked_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_reason       TEXT,
  issued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_active_cert UNIQUE (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_kc_user        ON knowledge_certificates (user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_kc_category    ON knowledge_certificates (category_id);
CREATE INDEX IF NOT EXISTS idx_kc_verify_code ON knowledge_certificates (verify_code);

-- ─── Sequence cho mã chứng nhận ─────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS knowledge_certificate_seq START 1;

-- Hàm sinh mã: CN-<YYYY>-<6 số>
CREATE OR REPLACE FUNCTION knowledge_next_certificate_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  next_val BIGINT;
BEGIN
  next_val := nextval('knowledge_certificate_seq');
  RETURN 'CN-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 6, '0');
END $$;

-- Hàm sinh verify_code 10 ký tự alphanumeric viết hoa
CREATE OR REPLACE FUNCTION knowledge_random_verify_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- bỏ I,O,1,0 cho dễ đọc
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN result;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE knowledge_certificates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_certificates' AND policyname = 'knowledge_certificates_all') THEN
    CREATE POLICY knowledge_certificates_all ON knowledge_certificates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;

-- Cách dùng:
--   SELECT knowledge_next_certificate_number();
--   SELECT knowledge_random_verify_code();
