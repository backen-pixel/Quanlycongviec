-- 44: Facebook webhook logs để monitor luồng nhận tên/tin nhắn
CREATE TABLE IF NOT EXISTS facebook_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT now(),
  status TEXT,
  result JSONB
);

CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_page ON facebook_webhook_logs(page_id);
CREATE INDEX IF NOT EXISTS idx_fb_webhook_logs_time ON facebook_webhook_logs(processed_at);

ALTER TABLE facebook_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb_logs_all" ON facebook_webhook_logs FOR ALL USING (true) WITH CHECK (true);
