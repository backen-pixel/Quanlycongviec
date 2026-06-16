-- 357_crm_assignment_schedules.sql
-- Giao việc CRM/SX theo lịch và lặp lại (daily/weekly/monthly).
-- Job backend spawn crm_assignments khi next_run_at <= now.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_assignment_schedules (
  id                  BIGSERIAL PRIMARY KEY,
  company_id          UUID REFERENCES companies(id) ON DELETE CASCADE,
  assignment_module   TEXT NOT NULL DEFAULT 'crm',
  title               TEXT NOT NULL,
  description         TEXT,
  column_id           BIGINT REFERENCES crm_assignment_columns(id) ON DELETE SET NULL,
  priority            crm_assignment_priority NOT NULL DEFAULT 'medium',
  created_by_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  assignee_ids        JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_start     TIMESTAMPTZ NOT NULL,
  deadline_at         TIMESTAMPTZ,
  recurrence_type     TEXT CHECK (recurrence_type IS NULL OR recurrence_type IN ('daily', 'weekly', 'monthly')),
  recurrence_interval INT NOT NULL DEFAULT 1,
  recurrence_end_at   TIMESTAMPTZ,
  next_run_at         TIMESTAMPTZ NOT NULL,
  last_run_at         TIMESTAMPTZ,
  last_assignment_id  BIGINT REFERENCES crm_assignments(id) ON DELETE SET NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_schedules_next_run
  ON crm_assignment_schedules (is_active, next_run_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crm_assignment_schedules_creator
  ON crm_assignment_schedules (created_by_id, is_active);

COMMENT ON TABLE crm_assignment_schedules IS
  'Lịch giao việc CRM/SX — spawn crm_assignments theo next_run_at; hỗ trợ lặp daily/weekly/monthly';

CREATE TABLE IF NOT EXISTS crm_assignment_schedule_files (
  id              BIGSERIAL PRIMARY KEY,
  schedule_id     BIGINT NOT NULL REFERENCES crm_assignment_schedules(id) ON DELETE CASCADE,
  kind            VARCHAR(10) NOT NULL DEFAULT 'req' CHECK (kind IN ('req', 'sub')),
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       BIGINT DEFAULT 0,
  mime_type       VARCHAR(200),
  storage_path    TEXT,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_schedule_files_schedule
  ON crm_assignment_schedule_files (schedule_id);

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS schedule_id BIGINT REFERENCES crm_assignment_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_assignments_schedule
  ON crm_assignments (schedule_id)
  WHERE schedule_id IS NOT NULL;

ALTER TABLE crm_assignment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_assignment_schedule_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignment_schedules'
      AND policyname='crm_assignment_schedules_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignment_schedules_all ON crm_assignment_schedules FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignment_schedule_files'
      AND policyname='crm_assignment_schedule_files_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignment_schedule_files_all ON crm_assignment_schedule_files FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
