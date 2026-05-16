-- 170_crm_user_planner.sql
-- Planner cá nhân: mỗi user tự tạo cột và kéo-thả lead/deal vào.
-- Lưu trên DB để bền và dùng đa thiết bị. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_user_planner_columns (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  color       TEXT,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_user_planner_columns_user
  ON crm_user_planner_columns (user_id, position);

CREATE TABLE IF NOT EXISTS crm_user_planner_items (
  id         BIGSERIAL PRIMARY KEY,
  column_id  BIGINT NOT NULL REFERENCES crm_user_planner_columns(id) ON DELETE CASCADE,
  lead_id    UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  position   INT NOT NULL DEFAULT 0,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (column_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_user_planner_items_column
  ON crm_user_planner_items (column_id, position);

CREATE INDEX IF NOT EXISTS idx_crm_user_planner_items_lead
  ON crm_user_planner_items (lead_id);

ALTER TABLE crm_user_planner_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_user_planner_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_user_planner_columns'
      AND policyname='crm_user_planner_columns_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_user_planner_columns_all ON crm_user_planner_columns FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_user_planner_items'
      AND policyname='crm_user_planner_items_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_user_planner_items_all ON crm_user_planner_items FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
