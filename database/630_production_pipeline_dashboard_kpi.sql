-- 630: Gán cột pipeline SX vào ô KPI Dashboard (Đang SX / Chờ VC / Đã VC).
-- null = chưa gán — KPI suy từ cờ bàn giao VC / tên «đã giao» / cột còn lại.
ALTER TABLE public.production_pipeline_stages
  ADD COLUMN IF NOT EXISTS dashboard_kpi TEXT;

ALTER TABLE public.production_pipeline_stages
  DROP CONSTRAINT IF EXISTS production_pipeline_stages_dashboard_kpi_chk;

ALTER TABLE public.production_pipeline_stages
  ADD CONSTRAINT production_pipeline_stages_dashboard_kpi_chk
  CHECK (dashboard_kpi IS NULL OR dashboard_kpi IN ('producing', 'awaiting_delivery', 'shipped'));

COMMENT ON COLUMN public.production_pipeline_stages.dashboard_kpi IS
  'Ô KPI Dashboard SX: producing=Đang sản xuất, awaiting_delivery=Chờ vận chuyển, shipped=Đã vận chuyển. Null = tự suy.';
