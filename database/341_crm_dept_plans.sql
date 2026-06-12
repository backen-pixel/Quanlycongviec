-- 341_crm_dept_plans.sql
-- Kế hoạch phòng ban (CRM): mỗi tuần của một phòng ban là 1 sheet (theo mẫu Excel
-- "KH tuần"): mỗi nhiệm vụ là 1 dòng có khoảng ngày Bắt đầu → Kết thúc (mini-Gantt),
-- KPI, nơi thực hiện, tần suất, trạng thái, tiến độ; sheet có mục "Tổng kết tuần".
-- Idempotent: chạy nhiều lần không lỗi.

BEGIN;

-- ─── 0) Nâng cấp từ bản nháp cũ (cột plan_date/plan_type) nếu đã lỡ chạy ──────
-- Bản cũ chưa có dữ liệu thật (tính năng chưa phát hành) nên tạo lại bảng tasks
-- theo schema mới; bảng sheets chỉ cần bổ sung cột summary.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_dept_plan_tasks' AND column_name='plan_date'
  ) THEN
    DROP TABLE crm_dept_plan_tasks;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='crm_dept_plan_sheets'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_dept_plan_sheets' AND column_name='summary'
  ) THEN
    ALTER TABLE crm_dept_plan_sheets ADD COLUMN summary JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ─── 1) Sheet tuần (mỗi phòng ban + tuần = 1 sheet, tự tạo khi truy cập) ───────
CREATE TABLE IF NOT EXISTS crm_dept_plan_sheets (
  id             BIGSERIAL PRIMARY KEY,
  department_id  UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  company_id     UUID REFERENCES companies(id) ON DELETE SET NULL,
  week_start     DATE NOT NULL, -- thứ Hai của tuần
  name           TEXT,
  -- Tổng kết tuần: { result, review, issues, proposals }
  summary        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_crm_dept_plan_sheets_dept
  ON crm_dept_plan_sheets (department_id, week_start DESC);

-- ─── 2) Nhiệm vụ trong sheet (1 dòng = 1 đầu công việc, kiểu Gantt tuần) ──────
CREATE TABLE IF NOT EXISTS crm_dept_plan_tasks (
  id             BIGSERIAL PRIMARY KEY,
  sheet_id       BIGINT NOT NULL REFERENCES crm_dept_plan_sheets(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- người thực hiện
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  task_group     TEXT,            -- nhóm đầu việc (vd: "Xây dựng kênh MXH")
  title          TEXT NOT NULL,   -- đầu công việc
  description    TEXT,            -- hành động cụ thể
  kpi            TEXT,            -- KPI (vd: "9 bài viết/tuần")
  location       TEXT,            -- nơi thực hiện (Văn phòng, Nhà máy, Facebook…)
  frequency      TEXT,            -- tần suất (Theo ngày, Theo tuần…)
  start_date     DATE NOT NULL,   -- bắt đầu
  end_date       DATE NOT NULL,   -- kết thúc
  status         TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'cancelled')),
  progress       INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  priority       TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  result_note    TEXT,            -- ghi chú kết quả
  position       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_dept_plan_tasks_sheet
  ON crm_dept_plan_tasks (sheet_id, position);
CREATE INDEX IF NOT EXISTS idx_crm_dept_plan_tasks_dept_range
  ON crm_dept_plan_tasks (department_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_crm_dept_plan_tasks_user
  ON crm_dept_plan_tasks (user_id, start_date);

-- RLS: backend dùng service-role; mở policy "all" như các bảng CRM khác.
ALTER TABLE crm_dept_plan_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_dept_plan_tasks  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_dept_plan_sheets'
      AND policyname='crm_dept_plan_sheets_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_dept_plan_sheets_all ON crm_dept_plan_sheets FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_dept_plan_tasks'
      AND policyname='crm_dept_plan_tasks_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_dept_plan_tasks_all ON crm_dept_plan_tasks FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
