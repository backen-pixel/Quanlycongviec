-- 551: loại phát sinh + SLA hạn (Không gian chung) — không chỉ kính.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shared_workspace_phat_sinh_kinds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  sla_mode TEXT NOT NULL DEFAULT 'same_day'
    CHECK (sla_mode IN ('same_day', 'noon_cutoff', 'working_days')),
  sla_days INT NOT NULL DEFAULT 1
    CHECK (sla_days >= 1 AND sla_days <= 30),
  cutoff_time TIME,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shared_workspace_phat_sinh_kinds IS
  'Loại phát sinh + SLA hạn trên Không gian chung. same_day = trong ngày đến giờ deadline xưởng; noon_cutoff = mốc trưa → ngày LV sau; working_days = cộng N ngày LV.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sw_phat_sinh_kinds_global_slug
  ON public.shared_workspace_phat_sinh_kinds (slug)
  WHERE company_id IS NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sw_phat_sinh_kinds_company_name
  ON public.shared_workspace_phat_sinh_kinds (company_id, lower(name))
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sw_phat_sinh_kinds_company
  ON public.shared_workspace_phat_sinh_kinds (company_id, sort_order)
  WHERE is_active = true;

INSERT INTO public.shared_workspace_phat_sinh_kinds
  (id, company_id, name, slug, sla_mode, sla_days, cutoff_time, sort_order)
VALUES
  ('a1000002-0000-4000-8000-000000000001', NULL, 'Kính cường lực', 'tempered_glass', 'working_days', 3, NULL, 10),
  ('a1000002-0000-4000-8000-000000000002', NULL, 'Kính không sơn', 'glass_unpainted', 'same_day', 1, NULL, 20),
  ('a1000002-0000-4000-8000-000000000003', NULL, 'Kính có sơn', 'glass_painted', 'noon_cutoff', 1, '12:00:00', 30)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_phat_sinh_kind_check;
ALTER TABLE public.crm_assignments DROP CONSTRAINT IF EXISTS crm_assignments_phat_sinh_kind_check;

COMMENT ON COLUMN public.crm_tasks.phat_sinh_kind IS
  'Slug/id loại phát sinh (shared_workspace_phat_sinh_kinds).';
COMMENT ON COLUMN public.crm_assignments.phat_sinh_kind IS
  'Slug/id loại phát sinh (shared_workspace_phat_sinh_kinds).';

ALTER TABLE public.shared_workspace_phat_sinh_kinds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_workspace_phat_sinh_kinds'
      AND policyname = 'shared_workspace_phat_sinh_kinds_all'
  ) THEN
    EXECUTE 'CREATE POLICY shared_workspace_phat_sinh_kinds_all ON public.shared_workspace_phat_sinh_kinds FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
