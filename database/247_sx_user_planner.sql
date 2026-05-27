-- 247_sx_user_planner.sql
-- Planner cá nhân cho module Sản xuất: mỗi user tự tạo cột và kéo-thả dự án vào.
-- Mirror cấu trúc 170_crm_user_planner.sql nhưng tham chiếu projects(id) thay vì leads.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS sx_user_planner_columns (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  color       TEXT,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sx_user_planner_columns_user
  ON sx_user_planner_columns (user_id, position);

CREATE TABLE IF NOT EXISTS sx_user_planner_items (
  id          BIGSERIAL PRIMARY KEY,
  column_id   BIGINT NOT NULL REFERENCES sx_user_planner_columns(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position    INT NOT NULL DEFAULT 0,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (column_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_sx_user_planner_items_column
  ON sx_user_planner_items (column_id, position);

CREATE INDEX IF NOT EXISTS idx_sx_user_planner_items_project
  ON sx_user_planner_items (project_id);

ALTER TABLE sx_user_planner_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sx_user_planner_items   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sx_user_planner_columns'
      AND policyname='sx_user_planner_columns_all'
  ) THEN
    EXECUTE 'CREATE POLICY sx_user_planner_columns_all ON sx_user_planner_columns FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sx_user_planner_items'
      AND policyname='sx_user_planner_items_all'
  ) THEN
    EXECUTE 'CREATE POLICY sx_user_planner_items_all ON sx_user_planner_items FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
