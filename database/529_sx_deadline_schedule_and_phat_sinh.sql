-- 529: giờ deadline xưởng (mặc định 17:30), SLA kính phát sinh, dồn lịch quá hạn.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sx_company_schedule_config (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  default_deadline_time TIME NOT NULL DEFAULT '17:30:00',
  glass_cutoff_time TIME NOT NULL DEFAULT '12:00:00',
  tempered_glass_days INT NOT NULL DEFAULT 3
    CHECK (tempered_glass_days >= 1 AND tempered_glass_days <= 30),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sx_company_schedule_config IS
  'Giờ deadline xưởng + SLA kính phát sinh theo công ty (mặc định 17:30 / trưa 12:00 / kính CL 3 ngày LV).';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sx_schedule_slip_days INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.projects.sx_schedule_slip_days IS
  'Số ngày LV đã dồn lịch (thùng trễ N ngày → hạn các công đoạn sau +N).';

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS phat_sinh_kind TEXT;

ALTER TABLE public.crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_phat_sinh_kind_check;
ALTER TABLE public.crm_tasks
  ADD CONSTRAINT crm_tasks_phat_sinh_kind_check
  CHECK (
    phat_sinh_kind IS NULL
    OR phat_sinh_kind IN ('tempered_glass', 'glass_unpainted', 'glass_painted')
  );

COMMENT ON COLUMN public.crm_tasks.department_id IS
  'Bộ phận nhận việc Không gian chung.';
COMMENT ON COLUMN public.crm_tasks.phat_sinh_kind IS
  'SLA kính phát sinh: tempered_glass | glass_unpainted | glass_painted.';

ALTER TABLE public.crm_assignments
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.crm_assignments
  ADD COLUMN IF NOT EXISTS phat_sinh_kind TEXT;

ALTER TABLE public.crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_phat_sinh_kind_check;
ALTER TABLE public.crm_assignments
  ADD CONSTRAINT crm_assignments_phat_sinh_kind_check
  CHECK (
    phat_sinh_kind IS NULL
    OR phat_sinh_kind IN ('tempered_glass', 'glass_unpainted', 'glass_painted')
  );

COMMENT ON COLUMN public.crm_assignments.department_id IS
  'Bộ phận nhận việc Không gian chung.';
COMMENT ON COLUMN public.crm_assignments.phat_sinh_kind IS
  'SLA kính phát sinh: tempered_glass | glass_unpainted | glass_painted.';

CREATE INDEX IF NOT EXISTS idx_crm_tasks_department_id
  ON public.crm_tasks (department_id)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_assignments_department_id
  ON public.crm_assignments (department_id)
  WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_sx_schedule_slip
  ON public.projects (sx_schedule_slip_days)
  WHERE sx_schedule_slip_days > 0;

COMMIT;
