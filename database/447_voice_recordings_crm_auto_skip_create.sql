-- 447: Đánh dấu ghi âm đã auto tạo/ghép lead — không tạo lại; xóa lead cũng khóa không tạo lại.
-- Bug: ON DELETE SET NULL trên voice_recordings.lead_id → xóa lead rồi enrich lại tạo lead mới (VD Vũ Pd).

ALTER TABLE public.voice_recordings
  ADD COLUMN IF NOT EXISTS crm_auto_skip_create boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.voice_recordings.crm_auto_skip_create IS
  'true = không auto tạo lead từ ghi âm (đã tạo/ghép, hoặc lead gắn đã bị xóa).';

CREATE INDEX IF NOT EXISTS idx_voice_recordings_auto_skip
  ON public.voice_recordings (crm_auto_skip_create)
  WHERE crm_auto_skip_create = false;

-- Bản đã gắn lead: coi như đã xử lý, không auto tạo lại nếu lead bị xóa.
UPDATE public.voice_recordings
SET crm_auto_skip_create = true
WHERE lead_id IS NOT NULL
  AND crm_auto_skip_create = false;
