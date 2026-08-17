-- Xưởng đặt xưởng: project nguồn (vd Metalla) → project nhận trên board xưởng khác (vd HCB).
-- Mỗi target_project chỉ thuộc một placement; không đặt trùng cùng (source, company, type).

CREATE TABLE IF NOT EXISTS public.project_workshop_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workshop_type_id uuid NULL REFERENCES public.workshop_project_types(id) ON DELETE SET NULL,
  delivery_date date NULL,
  production_finish_date date NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_workshop_placements_target_project_unique UNIQUE (target_project_id),
  CONSTRAINT project_workshop_placements_source_company_type_unique
    UNIQUE (source_project_id, target_company_id, workshop_type_id)
);

CREATE INDEX IF NOT EXISTS idx_project_workshop_placements_source
  ON public.project_workshop_placements (source_project_id);

CREATE INDEX IF NOT EXISTS idx_project_workshop_placements_target
  ON public.project_workshop_placements (target_project_id);

CREATE INDEX IF NOT EXISTS idx_project_workshop_placements_target_company
  ON public.project_workshop_placements (target_company_id);

COMMENT ON TABLE public.project_workshop_placements IS
  'Xưởng đặt xưởng: project nguồn → project nhận trên board công ty SX khác (kèm phân loại + ngày lắp/HT).';
