-- 191_crm_assignments.sql
-- Module "Giao việc CRM" — độc lập hoàn toàn với module Công việc (tasks) hiện có.
-- Cho phép quản lý/Sales trong CRM tự tạo các cột Kanban (To do / Doing / Review / Done…)
-- và giao nhiệm vụ cho nhân viên với deadline, priority, status.
-- Idempotent: chạy nhiều lần không lỗi.

BEGIN;

-- ─── 1) Cột Kanban (mỗi công ty một bộ cột; admin/quản lý tự quản lý) ──────────
CREATE TABLE IF NOT EXISTS crm_assignment_columns (
  id              BIGSERIAL PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,
  position        INT  NOT NULL DEFAULT 0,
  is_done_column  BOOLEAN NOT NULL DEFAULT false,
  created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_columns_company
  ON crm_assignment_columns (company_id, position);

-- ─── 2) Nhiệm vụ giao việc (độc lập với crm_tasks / tasks) ─────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_assignment_priority') THEN
    CREATE TYPE crm_assignment_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_assignment_status') THEN
    CREATE TYPE crm_assignment_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS crm_assignments (
  id              BIGSERIAL PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  column_id       BIGINT REFERENCES crm_assignment_columns(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  priority        crm_assignment_priority NOT NULL DEFAULT 'medium',
  status          crm_assignment_status   NOT NULL DEFAULT 'pending',
  deadline        TIMESTAMPTZ,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_assignments_company         ON crm_assignments (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_assignments_column_position ON crm_assignments (column_id, position);
CREATE INDEX IF NOT EXISTS idx_crm_assignments_assignee        ON crm_assignments (assignee_id);
CREATE INDEX IF NOT EXISTS idx_crm_assignments_deadline        ON crm_assignments (deadline);
CREATE INDEX IF NOT EXISTS idx_crm_assignments_status          ON crm_assignments (status);

-- RLS: backend dùng service-role; mở policy "all" như các bảng CRM khác.
ALTER TABLE crm_assignment_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_assignments        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignment_columns'
      AND policyname='crm_assignment_columns_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignment_columns_all ON crm_assignment_columns FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignments'
      AND policyname='crm_assignments_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignments_all ON crm_assignments FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
