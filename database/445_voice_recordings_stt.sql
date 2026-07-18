-- Pipeline STT ghi âm: phân loại Lead tiềm năng + trạng thái / transcript OpenAI Whisper
-- Phase 1: chỉ STT khi gắn crm_leads.type = 'lead'

ALTER TABLE voice_recordings
  ADD COLUMN IF NOT EXISTS prospect_class TEXT,
  ADD COLUMN IF NOT EXISTS prospect_classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stt_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS stt_error TEXT,
  ADD COLUMN IF NOT EXISTS stt_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stt_model TEXT,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS transcript_language TEXT DEFAULT 'vi',
  ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ;

COMMENT ON COLUMN voice_recordings.prospect_class IS
  'prospect_lead | deal | unlinked | unknown — phân loại theo liên kết CRM';
COMMENT ON COLUMN voice_recordings.stt_status IS
  'idle | pending | processing | done | failed | skipped';

CREATE INDEX IF NOT EXISTS idx_voice_recordings_stt_pending
  ON voice_recordings (stt_status, created_at)
  WHERE stt_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_voice_recordings_prospect_class
  ON voice_recordings (prospect_class)
  WHERE prospect_class IS NOT NULL;

-- Backfill phân loại theo lead đã gắn
UPDATE voice_recordings vr
SET
  prospect_class = CASE
    WHEN vr.lead_id IS NULL THEN 'unlinked'
    WHEN l.type = 'lead' THEN 'prospect_lead'
    WHEN l.type = 'deal' THEN 'deal'
    ELSE 'unknown'
  END,
  prospect_classified_at = COALESCE(vr.prospect_classified_at, NOW()),
  stt_status = CASE
    WHEN vr.transcript IS NOT NULL AND btrim(vr.transcript) <> '' THEN 'done'
    WHEN vr.lead_id IS NULL THEN 'skipped'
    WHEN l.type = 'lead' THEN 'idle'
    ELSE 'skipped'
  END
FROM crm_leads l
WHERE vr.lead_id = l.id
  AND (vr.prospect_class IS NULL OR vr.stt_status = 'idle');

UPDATE voice_recordings
SET
  prospect_class = 'unlinked',
  prospect_classified_at = COALESCE(prospect_classified_at, NOW()),
  stt_status = CASE
    WHEN transcript IS NOT NULL AND btrim(transcript) <> '' THEN 'done'
    ELSE 'skipped'
  END
WHERE lead_id IS NULL
  AND (prospect_class IS NULL OR stt_status = 'idle');
