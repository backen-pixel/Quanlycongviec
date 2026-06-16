-- 360_system_batch_jobs.sql
-- Hàng đợi batch job hệ thống — persist trạng thái, tiến độ, retry.
-- Worker: backend/src/jobs/batchQueueWorker.js (Redis LPUSH/BRPOP + fallback in-memory).
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS system_batch_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  result            JSONB,
  progress_current  INT NOT NULL DEFAULT 0,
  progress_total    INT NOT NULL DEFAULT 0,
  progress_meta     JSONB,
  error_message     TEXT,
  created_by_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  company_id        UUID REFERENCES companies(id) ON DELETE SET NULL,
  retry_count       INT NOT NULL DEFAULT 0,
  max_retries       INT NOT NULL DEFAULT 3,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_batch_jobs_status_created
  ON system_batch_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_batch_jobs_type
  ON system_batch_jobs (job_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_batch_jobs_creator
  ON system_batch_jobs (created_by_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_batch_jobs_company
  ON system_batch_jobs (company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

COMMENT ON TABLE system_batch_jobs IS
  'Hàng đợi batch job — queue Redis + persist Supabase; hỗ trợ pause/resume/retry';

ALTER TABLE system_batch_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_batch_jobs'
      AND policyname = 'system_batch_jobs_all'
  ) THEN
    EXECUTE 'CREATE POLICY system_batch_jobs_all ON system_batch_jobs FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
