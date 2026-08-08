-- Multi-day events (lắp đặt / vận chuyển): danh sách ngày có thể không liên tiếp
ALTER TABLE public.crm_events
  ADD COLUMN IF NOT EXISTS occurrence_dates date[] DEFAULT NULL;

COMMENT ON COLUMN public.crm_events.occurrence_dates IS
  'Các ngày diễn ra sự kiện (YYYY-MM-DD). Null/empty = chỉ dùng start_time (1 ngày). Dùng cho lắp đặt / vận chuyển nhiều ngày.';

CREATE INDEX IF NOT EXISTS idx_crm_events_occurrence_dates
  ON public.crm_events USING GIN (occurrence_dates)
  WHERE occurrence_dates IS NOT NULL;
