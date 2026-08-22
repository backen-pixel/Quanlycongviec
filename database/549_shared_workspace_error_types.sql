-- 549: loại lỗi Không gian chung + NV chịu trách nhiệm / vai trò khi giao việc.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_workspace_error_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  source_kind TEXT NOT NULL DEFAULT 'employee_error'
    CHECK (source_kind IN ('customer_request', 'employee_error')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shared_workspace_error_types IS
  'Danh mục loại lỗi / nguồn phát sinh trên Không gian chung. company_id NULL = dùng chung hệ thống.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sw_error_types_global_slug
  ON public.shared_workspace_error_types (slug)
  WHERE company_id IS NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sw_error_types_company_name
  ON public.shared_workspace_error_types (company_id, lower(name))
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sw_error_types_company
  ON public.shared_workspace_error_types (company_id, sort_order)
  WHERE is_active = true;

INSERT INTO public.shared_workspace_error_types (id, company_id, name, slug, source_kind, sort_order)
VALUES
  ('a1000001-0000-4000-8000-000000000001', NULL, 'Phát sinh từ khách hàng', 'customer_request', 'customer_request', 10),
  ('a1000001-0000-4000-8000-000000000002', NULL, 'Lỗi từ nhân viên', 'employee_error', 'employee_error', 20)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shared_workspace_error_type_staff (
  error_type_id UUID NOT NULL REFERENCES public.shared_workspace_error_types(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'executor'
    CHECK (role IN ('primary', 'executor', 'observer', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (error_type_id, company_id, user_id)
);

COMMENT ON TABLE public.shared_workspace_error_type_staff IS
  'NV mặc định theo loại lỗi + công ty: primary (chịu trách nhiệm, nhiều người), executor / observer / manager.';

CREATE INDEX IF NOT EXISTS idx_sw_error_type_staff_company
  ON public.shared_workspace_error_type_staff (company_id, error_type_id);

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS error_type_id UUID REFERENCES public.shared_workspace_error_types(id) ON DELETE SET NULL;

ALTER TABLE public.crm_assignments
  ADD COLUMN IF NOT EXISTS error_type_id UUID REFERENCES public.shared_workspace_error_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.crm_tasks.error_type_id IS
  'Loại lỗi / nguồn phát sinh (danh mục shared_workspace_error_types).';
COMMENT ON COLUMN public.crm_assignments.error_type_id IS
  'Loại lỗi / nguồn phát sinh (danh mục shared_workspace_error_types).';

ALTER TABLE public.crm_assignment_assignees
  ADD COLUMN IF NOT EXISTS assign_role TEXT NOT NULL DEFAULT 'executor';

ALTER TABLE public.crm_assignment_assignees
  DROP CONSTRAINT IF EXISTS crm_assignment_assignees_assign_role_check;
ALTER TABLE public.crm_assignment_assignees
  ADD CONSTRAINT crm_assignment_assignees_assign_role_check
  CHECK (assign_role IN ('primary', 'executor', 'observer', 'manager'));

COMMENT ON COLUMN public.crm_assignment_assignees.assign_role IS
  'Vai trò trên phân công: primary | executor | observer | manager.';

UPDATE public.crm_assignment_assignees a
SET assign_role = 'primary'
FROM public.crm_assignments c
WHERE a.assignment_id = c.id
  AND a.user_id = c.assignee_id
  AND COALESCE(a.assign_role, 'executor') = 'executor';

ALTER TABLE public.shared_workspace_error_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_workspace_error_type_staff ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_workspace_error_types'
      AND policyname = 'shared_workspace_error_types_all'
  ) THEN
    EXECUTE 'CREATE POLICY shared_workspace_error_types_all ON public.shared_workspace_error_types FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_workspace_error_type_staff'
      AND policyname = 'shared_workspace_error_type_staff_all'
  ) THEN
    EXECUTE 'CREATE POLICY shared_workspace_error_type_staff_all ON public.shared_workspace_error_type_staff FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
