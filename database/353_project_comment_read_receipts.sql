-- 353_project_comment_read_receipts.sql
-- Theo dõi lần đọc bình luận dự án cuối cùng của từng user (giống messenger_read_receipts).
-- Idempotent.

BEGIN;

DO $$
DECLARE
  pid_type TEXT;
  tbl_exists BOOLEAN;
BEGIN
  SELECT data_type INTO pid_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_comment_read_receipts'
  ) INTO tbl_exists;

  IF NOT tbl_exists THEN
    IF pid_type = 'bigint' OR pid_type = 'integer' THEN
      EXECUTE '
        CREATE TABLE project_comment_read_receipts (
          project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (project_id, user_id)
        )';
    ELSIF pid_type = 'uuid' THEN
      EXECUTE '
        CREATE TABLE project_comment_read_receipts (
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (project_id, user_id)
        )';
    ELSE
      RAISE NOTICE 'Bỏ qua project_comment_read_receipts: projects.id type=% chưa hỗ trợ', pid_type;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_comment_read_receipts_user
  ON project_comment_read_receipts (user_id);

ALTER TABLE project_comment_read_receipts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_comment_read_receipts'
      AND policyname = 'project_comment_read_receipts_all'
  ) THEN
    EXECUTE 'CREATE POLICY project_comment_read_receipts_all ON project_comment_read_receipts FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON TABLE project_comment_read_receipts IS 'Thời điểm user đọc bình luận dự án lần cuối — dùng tính Đã xem / Đã nhận trên từng bình luận';

COMMIT;
