-- Multi-company SX: 1 deal CRM ↔ nhiều dự án sản xuất
-- crm_leads.project_id vẫn là dự án chính (primary); bảng này lưu đầy đủ liên kết.
-- Lưu ý: nhiều deal có thể cùng 1 project_id (fulfillment) → KHÔNG UNIQUE project_id đơn.

CREATE TABLE IF NOT EXISTS public.crm_deal_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  label text NULL,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_deal_projects_deal_project_unique UNIQUE (deal_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_projects_deal_id
  ON public.crm_deal_projects (deal_id);

CREATE INDEX IF NOT EXISTS idx_crm_deal_projects_project_id
  ON public.crm_deal_projects (project_id);

CREATE INDEX IF NOT EXISTS idx_crm_deal_projects_deal_primary
  ON public.crm_deal_projects (deal_id)
  WHERE is_primary = true;

COMMENT ON TABLE public.crm_deal_projects IS
  'Liên kết deal CRM với nhiều dự án SX (mỗi công ty/phân loại một project). Nhiều deal có thể share 1 project (fulfillment).';

-- Drop UNIQUE project_id nếu migration cũ đã tạo
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crm_deal_projects_project_unique'
  ) THEN
    ALTER TABLE public.crm_deal_projects DROP CONSTRAINT crm_deal_projects_project_unique;
  END IF;
END $$;

-- Backfill: mọi deal đã có project_id → 1 row primary (mỗi deal một link)
INSERT INTO public.crm_deal_projects (deal_id, project_id, is_primary, created_at)
SELECT l.id, l.project_id, true, COALESCE(l.updated_at, l.created_at, now())
FROM public.crm_leads l
WHERE l.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_deal_projects d
    WHERE d.deal_id = l.id AND d.project_id = l.project_id
  )
ON CONFLICT (deal_id, project_id) DO NOTHING;
