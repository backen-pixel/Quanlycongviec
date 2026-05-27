-- 248_project_comments_threads_reactions.sql
-- Mở rộng project_comments cho module Sản xuất (giống CRM lead comments):
--   - Trả lời (parent_id, self-FK)
--   - updated_at + deleted_at (sửa / xoá mềm sau này nếu cần)
--   - Bảng cảm xúc project_comment_reactions (1 emoji / user / comment)
-- Tự phát hiện kiểu id của project_comments (UUID hoặc BIGINT) để khớp.
-- Idempotent.

BEGIN;

-- 1) updated_at / deleted_at (cột tự bù)
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2) parent_id (self-FK) — match data_type của id
DO $$
DECLARE
  id_type TEXT;
  has_parent BOOLEAN;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'project_comments' AND column_name = 'id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_comments' AND column_name = 'parent_id'
  ) INTO has_parent;

  IF NOT has_parent THEN
    IF id_type = 'bigint' OR id_type = 'integer' THEN
      EXECUTE 'ALTER TABLE project_comments ADD COLUMN parent_id BIGINT REFERENCES project_comments(id) ON DELETE CASCADE';
    ELSIF id_type = 'uuid' THEN
      EXECUTE 'ALTER TABLE project_comments ADD COLUMN parent_id UUID REFERENCES project_comments(id) ON DELETE CASCADE';
    ELSE
      RAISE NOTICE 'Bỏ qua thêm parent_id: id_type=% chưa hỗ trợ', id_type;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_comments_project_parent
  ON project_comments (project_id, parent_id, created_at)
  WHERE deleted_at IS NULL;

-- 3) Bảng cảm xúc — comment_id khớp kiểu id của project_comments
DO $$
DECLARE
  id_type TEXT;
  has_table BOOLEAN;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'project_comments' AND column_name = 'id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_comment_reactions'
  ) INTO has_table;

  IF NOT has_table THEN
    IF id_type = 'bigint' OR id_type = 'integer' THEN
      EXECUTE $sql$
        CREATE TABLE project_comment_reactions (
          comment_id BIGINT NOT NULL REFERENCES project_comments(id) ON DELETE CASCADE,
          user_id    UUID   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          emoji      TEXT   NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (comment_id, user_id)
        )
      $sql$;
    ELSIF id_type = 'uuid' THEN
      EXECUTE $sql$
        CREATE TABLE project_comment_reactions (
          comment_id UUID  NOT NULL REFERENCES project_comments(id) ON DELETE CASCADE,
          user_id    UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          emoji      TEXT  NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (comment_id, user_id)
        )
      $sql$;
    ELSE
      RAISE NOTICE 'Bỏ qua tạo project_comment_reactions: id_type=% chưa hỗ trợ', id_type;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_comment_reactions_comment
  ON project_comment_reactions (comment_id);

ALTER TABLE project_comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_comment_reactions'
      AND policyname = 'project_comment_reactions_all'
  ) THEN
    EXECUTE 'CREATE POLICY project_comment_reactions_all ON project_comment_reactions FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMENT ON COLUMN project_comments.parent_id IS 'NULL = bình luận gốc; khác NULL = trả lời bình luận id=parent_id';
COMMENT ON TABLE project_comment_reactions IS 'Thả cảm xúc lên bình luận dự án sản xuất (1 emoji / user / comment)';

COMMIT;
