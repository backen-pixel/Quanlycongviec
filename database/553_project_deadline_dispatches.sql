-- 553: log gửi webhook nhắc hạn công trình (cron → n8n/API).
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.project_deadline_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  module_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  webhook_url TEXT,
  http_status INT,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_deadline_dispatches IS
  'Cron nhắc hạn công trình: mỗi lần POST webhook (n8n/Zalo) ghi 1 dòng để chống gửi trùng.';

CREATE INDEX IF NOT EXISTS idx_pdd_fingerprint_sent
  ON public.project_deadline_dispatches (fingerprint, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdd_sent_at
  ON public.project_deadline_dispatches (sent_at DESC);
