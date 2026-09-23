-- 631: Cột pipeline VC/LĐ — Tắt hạn + gán ô KPI Dashboard (Đang VC / Đang LĐ / BH / Hoàn thành).
ALTER TABLE public.logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS clears_deadline BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.logistics_pipeline_stages.clears_deadline IS
  'Khi true: cột không còn đếm/hiện quá hạn VC/LĐ. Không xóa ngày lắp (lịch sử).';

ALTER TABLE public.logistics_pipeline_stages
  ADD COLUMN IF NOT EXISTS dashboard_kpi TEXT;

ALTER TABLE public.logistics_pipeline_stages
  DROP CONSTRAINT IF EXISTS logistics_pipeline_stages_dashboard_kpi_chk;

ALTER TABLE public.logistics_pipeline_stages
  ADD CONSTRAINT logistics_pipeline_stages_dashboard_kpi_chk
  CHECK (dashboard_kpi IS NULL OR dashboard_kpi IN ('shipping', 'installing', 'warranty', 'completed'));

COMMENT ON COLUMN public.logistics_pipeline_stages.dashboard_kpi IS
  'Ô KPI Dashboard VC/LĐ: shipping=Đang vận chuyển, installing=Đang lắp đặt, warranty=Bảo hành, completed=Hoàn thành. Null = tự suy.';
