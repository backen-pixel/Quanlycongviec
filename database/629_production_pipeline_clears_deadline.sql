-- 629: Cột pipeline SX «Tắt hạn» — kéo thẻ vào cột thì tắt deadline SX.
ALTER TABLE public.production_pipeline_stages
  ADD COLUMN IF NOT EXISTS clears_deadline BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.production_pipeline_stages.clears_deadline IS
  'Khi true: chuyển dự án vào cột này sẽ xóa hạn SX (sx_kanban / production_deadline / hoàn thiện). Cột không còn hiện quá hạn.';
