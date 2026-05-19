-- 194_crm_assignment_files.sql
-- File gắn nhiệm vụ Giao việc CRM (tách khỏi file_attachments vì entity_id ở đó là UUID).
-- kind: 'req' = file yêu cầu (người giao), 'sub' = file nộp (NV làm).
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_assignment_files (
  id              BIGSERIAL PRIMARY KEY,
  assignment_id   BIGINT NOT NULL REFERENCES crm_assignments(id) ON DELETE CASCADE,
  kind            VARCHAR(10) NOT NULL CHECK (kind IN ('req', 'sub')),
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_size       BIGINT DEFAULT 0,
  mime_type       VARCHAR(200),
  storage_path    TEXT,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_files_assignment
  ON crm_assignment_files (assignment_id, kind, created_at);

ALTER TABLE crm_assignment_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignment_files'
      AND policyname='crm_assignment_files_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignment_files_all ON crm_assignment_files FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
