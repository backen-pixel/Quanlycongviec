-- 552: loại lỗi / hạn phát sinh + NV phụ trách — chung cả hệ sinh thái (không theo công ty).
-- Idempotent.

BEGIN;

-- Gộp NV trùng (cùng loại + người, khác công ty): giữ vai trò cao hơn.
DELETE FROM public.shared_workspace_error_type_staff s
WHERE ctid IN (
  SELECT ctid FROM (
    SELECT ctid,
      ROW_NUMBER() OVER (
        PARTITION BY error_type_id, user_id
        ORDER BY CASE role
          WHEN 'primary' THEN 0
          WHEN 'manager' THEN 1
          WHEN 'executor' THEN 2
          ELSE 3
        END, created_at
      ) AS rn
    FROM public.shared_workspace_error_type_staff
  ) x
  WHERE rn > 1
);

ALTER TABLE public.shared_workspace_error_type_staff
  DROP CONSTRAINT IF EXISTS shared_workspace_error_type_staff_pkey;

ALTER TABLE public.shared_workspace_error_type_staff
  ALTER COLUMN company_id DROP NOT NULL;

UPDATE public.shared_workspace_error_type_staff
SET company_id = NULL
WHERE company_id IS NOT NULL;

ALTER TABLE public.shared_workspace_error_type_staff
  DROP CONSTRAINT IF EXISTS shared_workspace_error_type_staff_pkey;

ALTER TABLE public.shared_workspace_error_type_staff
  ADD PRIMARY KEY (error_type_id, user_id);

COMMENT ON TABLE public.shared_workspace_error_type_staff IS
  'NV mặc định theo loại lỗi, dùng chung hệ sinh thái (company_id luôn NULL).';

UPDATE public.shared_workspace_error_types
SET company_id = NULL
WHERE company_id IS NOT NULL;

UPDATE public.shared_workspace_phat_sinh_kinds
SET company_id = NULL
WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sw_error_types_global_name
  ON public.shared_workspace_error_types (lower(name))
  WHERE company_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sw_phat_sinh_kinds_global_name
  ON public.shared_workspace_phat_sinh_kinds (lower(name))
  WHERE company_id IS NULL;

COMMIT;
