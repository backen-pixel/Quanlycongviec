-- Log thao tác ghi trên backup khi failover — replay về primary khi failback.
CREATE TABLE IF NOT EXISTS supabase_failback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL DEFAULT 'rest' CHECK (job_type IN ('rest', 'storage')),
  method TEXT,
  path TEXT,
  headers JSONB,
  body TEXT,
  bucket TEXT,
  storage_path TEXT,
  mimetype TEXT,
  upsert BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_to_primary BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_supabase_failback_log_pending
  ON supabase_failback_log (created_at)
  WHERE applied_to_primary = false;

COMMENT ON TABLE supabase_failback_log IS 'Ghi write trên backup khi failover; replay về primary trước failback';
